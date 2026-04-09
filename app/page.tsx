'use client';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { format, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isToday } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Sun, Moon, Menu, Plus, X, CheckCircle, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';

interface Task {
  id: number;
  title: string;
  date: string;
  time?: string;
  detail: string;
  completed: boolean;
  isAllDay: boolean;
  isEvent: boolean;
}

interface DbTask {
  id: number;
  title: string;
  date: string;
  time: string | null;
  detail: string;
  completed: boolean;
  is_all_day: boolean;
  is_event: boolean;
  user_id: string;        // ← 追加
}

export default function Home() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isEventMode, setIsEventMode] = useState(false);
  const [selectedHour, setSelectedHour] = useState(9);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [newTaskDetail, setNewTaskDetail] = useState('');

  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'calendar' | 'task-list'>('home');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isFromCalendar, setIsFromCalendar] = useState(false);
  const [taskListMonth, setTaskListMonth] = useState(new Date());
  const [showTaskListMonthPicker, setShowTaskListMonthPicker] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);

  // ★★★ 新規：現在のユーザーID管理 ★★★
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

// ====================== Supabase 認証・ユーザーID取得 ======================
useEffect(() => {
  const initAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.signInAnonymously();
      setCurrentUserId(data?.user?.id ?? null);
    } else {
      setCurrentUserId(session.user.id);
    }
  };
  initAuth();
}, []);

  const mapToTask = (row: DbTask): Task => ({
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time || undefined,
    detail: row.detail,
    completed: row.completed,
    isAllDay: row.is_all_day,
    isEvent: row.is_event,
  });

  const fetchTasks = useCallback(async () => {
    if (!currentUserId) return;

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', currentUserId)
      .order('date', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('タスク取得エラー:', error);
      return;
    }
    setTasks((data || []).map(mapToTask));
  }, [currentUserId]);

  // 初回読み込み（VSCode警告を完全に除去）
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);   // ← これで警告が消えます

  // ====================== 共通ソート ======================
  const sortTasksForDay = (dayTasks: Task[]) => {
    return [...dayTasks].sort((a, b) => {
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      if (a.isAllDay && b.isAllDay) return b.id - a.id;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return b.id - a.id;
    });
  };

  // ====================== タスク操作（user_id対応版） ======================
  const saveTask = async () => {
    if (!newTaskTitle || !currentUserId) return;

    const time = !isAllDay
      ? `${selectedHour.toString().padStart(2, '0')}:${(selectedMinute * 5).toString().padStart(2, '0')}`
      : null;

    const baseData = {
      title: newTaskTitle,
      date: format(selectedDate, 'yyyy-MM-dd'),
      time,
      detail: newTaskDetail || 'メモなし',
      is_all_day: isAllDay,
      is_event: isEventMode,
      user_id: currentUserId,           // ← ここが重要！
    };

    if (isEditing && editingId !== null) {
      const { error } = await supabase
        .from('tasks')
        .update(baseData)
        .eq('id', editingId)
        .eq('user_id', currentUserId);   // 安全のためuser_idも条件に
      if (error) console.error('更新エラー:', error);
    } else {
      const { error } = await supabase
        .from('tasks')
        .insert([{ ...baseData, completed: false }]);
      if (error) console.error('新規作成エラー:', error);
    }

    setIsModalOpen(false);
    resetModalForm();
    fetchTasks();
  };

  const toggleComplete = async (id: number) => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('tasks')
      .update({ completed: true })
      .eq('id', id)
      .eq('user_id', currentUserId);
    if (error) console.error(error);
    fetchTasks();
  };

  const handleDeleteFromDetail = async (id: number) => {
    if (!currentUserId) return;
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId);
    if (error) console.error(error);
    setIsDetailModalOpen(false);
    setSelectedTaskForDetail(null);
    fetchTasks();
  };

  // 他の関数（openEditModal, resetModalFormなど）は変更なし
  const openEditModal = (task: Task) => {
    setIsEventMode(task.isEvent);
    setIsAllDay(task.isAllDay);
    setSelectedDate(new Date(task.date));
    setNewTaskTitle(task.title);
    setNewTaskDetail(task.detail);
    if (task.time) {
      const [h, m] = task.time.split(':').map(Number);
      setSelectedHour(h);
      setSelectedMinute(Math.floor(m / 5));
    }
    setIsEditing(true);
    setEditingId(task.id);
    setIsDetailModalOpen(false);
    setIsModalOpen(true);
  };

  const resetModalForm = () => {
    setNewTaskTitle('');
    setNewTaskDetail('');
    setIsAllDay(false);
    setIsEditing(false);
    setEditingId(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setSelectedHour(9);
    setSelectedMinute(0);
  };

  const openDetailModal = (task: Task) => {
    setSelectedTaskForDetail(task);
    setIsDetailModalOpen(true);
  };

  const handleCompleteFromDetail = (id: number) => {
    toggleComplete(id);
    setIsDetailModalOpen(false);
    setSelectedTaskForDetail(null);
  };

  const handleDragEnd = (id: number, offset: number) => {
    if (showConfirmModal) return;
    if (offset > 80) {
      setSwipeDirection('right');
      setSelectedTaskId(id);
      setShowConfirmModal(true);
    } else if (offset < -80) {
      setSwipeDirection('left');
      setSelectedTaskId(id);
      setTimeout(() => {
        toggleComplete(id);
        setSwipeDirection(null);
        setSelectedTaskId(null);
      }, 300);
    }
  };

  // ====================== ダークモード（VSCode警告完全除去版） ======================
  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

    // 初回のみ同期的に適用（警告回避のためsetStateを分離）
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    setIsDarkMode(shouldBeDark);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  return (
      <div className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* ヘッダー */}
      <header className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between px-6 h-16">
          {/* ★★★ ダークモード切り替えボタン（Sun/Moon 切り替え） ★★★ */}
          <button
            onClick={() => {
              console.log('【ボタンクリック】現在のisDarkMode =', isDarkMode, '→ 切り替えます');
              setIsDarkMode(!isDarkMode);
            }}
            className="p-2 active:scale-95 transition-transform"
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>

          {/* 中央タイトル */}
          <button
            onClick={() => {
              setCurrentView('home');
              setCurrentDate(new Date());
              setIsFromCalendar(false);
            }}
            className="text-xl font-bold tracking-tight active:scale-95 transition-transform"
          >
            Task Portfolio App
          </button>

          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2">
            <Menu size={24} />
          </button>
        </div>
      </header>

      {/* 日付ナビ（ホーム・日付画面・カレンダー画面のみ） */}
      {currentView !== 'task-list' && (
        <div className="max-w-md px-0 pt-6 pb-4 relative">
          {/* ホーム画面 */}
          {currentView === 'home' && !isFromCalendar && (
            <div className="flex items-center justify-between">
              <button onClick={() => setCurrentDate(subDays(currentDate, 1))} className="text-blue-600 dark:text-blue-400 font-medium px-6 py-2">Prev</button>
              <div className="text-center flex-1">
                <p className="text-2xl font-semibold">{format(currentDate, 'EEE MMM d', { locale: enUS })}</p>
              </div>
              <button onClick={() => setCurrentDate(addDays(currentDate, 1))} className="text-blue-600 dark:text-blue-400 font-medium px-6 py-2">Next</button>
            </div>
          )}

          {/* 日付画面 */}
          {isFromCalendar && (
            <>
              <button
                onClick={() => { setCurrentView('calendar'); setIsFromCalendar(false); }}
                className="absolute left-4 top-1 z-10 flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium active:scale-95 transition-transform"
              >
                <span className="text-2xl leading-none">←</span>
                <span className="text-base">Back</span>
              </button>
              <div className="text-center pt-1 pb-1">
                <p className="text-2xl font-semibold">{format(currentDate, 'EEE MMM d', { locale: enUS })}</p>
              </div>
            </>
          )}

          {/* カレンダー画面 */}
          {currentView === 'calendar' && (
            <div className="flex items-center justify-between">
              <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="text-blue-600 dark:text-blue-400 font-medium px-6 py-2">Prev</button>
              <div className="text-center flex-1">
                <p className="text-2xl font-semibold">{format(calendarMonth, 'MMMM yyyy', { locale: enUS })}</p>
              </div>
              <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="text-blue-600 dark:text-blue-400 font-medium px-6 py-2">Next</button>
            </div>
          )}
        </div>
      )}

{/* ====================== メインコンテンツ ====================== */}
<div className="flex-1 overflow-hidden px-0 relative">
  {currentView === 'home' && (
    /* ホーム画面（タイムライン） — 変更なし */
    <>
      <div className="h-full overflow-y-auto space-y-4 pb-16 px-6 scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <AnimatePresence>
          {sortTasksForDay(
            tasks
              .filter((task) => task.date === format(currentDate, 'yyyy-MM-dd'))
              .filter((task) => !task.completed)
          ).map((task) => (
            <div key={task.id} className="relative rounded-3xl shadow-lg overflow-hidden">
              <div className="absolute top-0 bottom-0 right-0 w-40 bg-emerald-500 flex items-center justify-center text-white font-semibold text-lg z-0 rounded-r-3xl">
                <div className="flex items-center gap-3">
                  <CheckCircle size={28} />
                  完了
                </div>
              </div>
              <motion.div
                drag="x"
                dragConstraints={{ left: -210, right: 120 }}
                dragElastic={0.08}
                dragMomentum={false}
                dragSnapToOrigin={true}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={(_, info) => {
                  handleDragEnd(task.id, info.offset.x);
                  setTimeout(() => setIsDragging(false), 150);
                }}
                onTap={() => {
                  if (!isDragging) openDetailModal(task);
                }}
                whileDrag={{ scale: 0.98 }}
                className={`p-6 cursor-grab active:cursor-grabbing relative z-10 ${
                  task.isEvent
                    ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
                    : 'bg-white dark:bg-gray-900'
                }`}
              >
                <div className="flex justify-between items-start relative z-10">
                  <div className="w-full">
                    {task.time && (
                      <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">
                        {task.time}
                      </p>
                    )}
                    <p className="font-semibold text-lg mt-1">{task.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                      {task.detail}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          ))}
        </AnimatePresence>
      </div>

      <div
        className="absolute bottom-0 left-6 right-6 h-24 pointer-events-none z-10
                   bg-gradient-to-t
                   from-gray-50 via-gray-50/85 to-transparent
                   dark:from-gray-950 dark:via-gray-950/85"
      />
    </>
  )}

  {currentView === 'calendar' && (
    /* カレンダー画面 — 変更なし */
    <div className="flex-1 flex flex-col">
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">
        {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
          <div key={i} className={i === 0 ? 'text-red-500' : ''}>{day}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 bg-gray-200 dark:bg-gray-700 overflow-hidden">
        {(() => {
          const monthStart = startOfMonth(calendarMonth);
          const monthEnd = endOfMonth(calendarMonth);
          const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
          const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start: startDate, end: endDate });

          return days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayTasks = tasks.filter(t => t.date === dateStr);
            const sortedDayTasks = sortTasksForDay(dayTasks);
            const isCurrentMonth = isSameMonth(day, calendarMonth);
            const isTodayDate = isToday(day);

            return (
              <button
                key={dateStr}
                onClick={() => {
                  setCurrentDate(day);
                  setCurrentView('home');
                  setIsFromCalendar(true);
                }}
                className={`min-h-[118px] flex flex-col items-start p-1 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ${
                  !isCurrentMonth ? 'opacity-40' : ''
                }`}
              >
                <div className={`w-6 h-6 flex items-center justify-center text-sm font-medium rounded-full mb-1 ${isTodayDate ? 'bg-blue-600 text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                  {format(day, 'd')}
                </div>
                <div className="flex-1 w-full space-y-0.5 overflow-hidden">
                  {sortedDayTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className={`text-[10px] px-0 py-0.5 rounded truncate w-full ${
                        task.isEvent
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      }`}
                    >
                      {task.title}
                    </div>
                  ))}
                  {sortedDayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">
                      +{sortedDayTasks.length - 3}
                    </div>
                  )}
                </div>
              </button>
            );
          });
        })()}
      </div>
    </div>
  )}

{/* ====================== タスク一覧画面（1行目に日付ボックス付き・2行目以降は左に空白 + 下部グラデーション追加） ====================== */}
  {currentView === 'task-list' && (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {/* 上部ヘッダー — 変更なし */}
      <div className="max-w-md mx-auto w-full px-6 pt-3 pb-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div className="flex items-center gap-3">
          <div className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {format(taskListMonth, 'MMMM yyyy', { locale: enUS })}
          </div>
          <button
            onClick={() => setShowTaskListMonthPicker(true)}
            className="text-blue-600 dark:text-blue-400 text-xl leading-none pt-0.5 active:scale-95 transition-transform"
          >
            ▼
          </button>
        </div>
      </div>

      {/* リスト本体 — relativeにして下部グラデーションを追加 */}
      <div className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-y-auto px-4 py-4 scrollbar-hide [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <AnimatePresence>
            {(() => {
              const monthStart = startOfMonth(taskListMonth);
              const monthEnd = endOfMonth(taskListMonth);
              const monthTasks = tasks
                .filter(t => {
                  const d = new Date(t.date);
                  return d >= monthStart && d <= monthEnd;
                })
                .sort((a, b) => a.date.localeCompare(b.date));

              const grouped = monthTasks.reduce((acc, task) => {
                if (!acc[task.date]) acc[task.date] = [];
                acc[task.date].push(task);
                return acc;
              }, {} as Record<string, Task[]>);

              return Object.keys(grouped).map((dateStr) => {
                const dateObj = new Date(dateStr);
                const dayTasks = sortTasksForDay(grouped[dateStr]);

                return (
                  <div key={dateStr} className="mb-8">
                    {/* 1日分のタスク群 */}
                    <div className="space-y-3">
                      {dayTasks.map((task, index) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-4"
                        >
                          {/* 1行目（最初のタスク）だけ左に日付ボックスを表示 */}
                          {index === 0 && (
                            <div className="w-9 h-9 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center flex-shrink-0 shadow-sm">
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 tracking-widest">
                                {format(dateObj, 'EEE', { locale: enUS })}
                              </div>
                              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-none -mt-0.5">
                                {format(dateObj, 'd')}
                              </div>
                            </div>
                          )}

                          {/* 2行目以降は同じ幅の空白を空ける */}
                          {index !== 0 && (
                            <div className="w-9 flex-shrink-0" />
                          )}

                          {/* タスク本体 */}
                          <motion.div
                            onClick={() => openDetailModal(task)}
                            whileTap={{ scale: 0.97 }}
                            className={`flex-1 text-[11px] px-4 py-2.5 rounded-2xl font-medium cursor-pointer transition-all truncate flex items-center gap-2 ${
                              task.isEvent
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            }`}
                          >
                            {task.time && (
                              <span className="text-[10px] font-medium opacity-75">
                                {task.time}
                              </span>
                            )}
                            <span className="flex-1 truncate">{task.title}</span>
                          </motion.div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </AnimatePresence>
        </div>

        {/* ====================== 画面下部グラデーション（ホーム画面と完全に統一） ====================== */}
        <div
          className="absolute bottom-0 left-4 right-4 h-24 pointer-events-none z-10
                     bg-gradient-to-t
                     from-gray-50 via-gray-50/85 to-transparent
                     dark:from-gray-950 dark:via-gray-950/85"
        />
      </div>
    </div>
  )}
</div>

      {/* FAB + Speed Dial */}
      <div className="fixed bottom-8 right-8 z-50">
        <motion.button
          onClick={() => setIsFabOpen(!isFabOpen)}
          className="w-16 h-16 bg-blue-600 rounded-full shadow-2xl flex items-center justify-center text-white"
          whileTap={{ scale: 0.9 }}
        >
          {isFabOpen ? <X size={32} /> : <Plus size={32} />}
        </motion.button>

        <AnimatePresence>
          {isFabOpen && (
            <div className="absolute bottom-20 right-0 flex flex-col gap-5 items-end">
                            {/* 新規タスク */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">Task</span>
                <motion.button
                  // 新規タスクボタン（Task）
                  onClick={() => {
                    setIsEventMode(false);
                    setIsAllDay(true);
                    setSelectedDate(currentDate);   // ← 追加：メイン画面の日付を初期値に
                    const now = new Date();
                    setSelectedHour(now.getHours());
                    setSelectedMinute(Math.floor(now.getMinutes() / 5));
                    setIsModalOpen(true);
                  }}
                  className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl"
                  whileTap={{ scale: 0.9 }}
                >
                  <CheckCircle size={26} />
                </motion.button>
              </div>

              {/* 新規イベント */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-12 text-right">Event</span>
                <motion.button
                  // 新規イベントボタン（Event）
                  onClick={() => {
                    setIsEventMode(true);
                    setIsAllDay(false);
                    setSelectedDate(currentDate);   // ← 追加：メイン画面の日付を初期値に
                    const now = new Date();
                    setSelectedHour(now.getHours());
                    setSelectedMinute(Math.floor(now.getMinutes() / 5));
                    setIsModalOpen(true);
                  }}
                  className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-2xl"
                  whileTap={{ scale: 0.9 }}
                >
                  <Calendar size={26} />
                </motion.button>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

            {/* 新規モーダル（Googleカレンダー風日時指定） */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-60 flex items-end">
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="bg-white dark:bg-gray-900 w-full max-w-md mx-auto rounded-t-3xl p-8 max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold mb-6">
                {isEditing ? 'タスクを編集' : `新しい${isEventMode ? 'イベント' : 'タスク'}を作成`}
              </h3>

              {/* タイトル入力 */}
              <input
                type="text"
                placeholder="タスク名"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-2xl px-5 py-4 mb-6 focus:outline-none focus:border-blue-500"
              />

              {/* 詳細入力 */}
              <textarea
                placeholder="詳細・メモ"
                value={newTaskDetail}
                onChange={(e) => setNewTaskDetail(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-2xl px-5 py-4 h-24 resize-none mb-3 focus:outline-none focus:border-blue-500"
              />

              {/* ==================== 日時指定エリア ==================== */}
              <div className="space-y-3">   {/* ← 余白をさらに縮小 */}
                {/* ALL DAY トグル */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">ALL DAY</span>
                  <button
                    onClick={() => setIsAllDay(!isAllDay)}
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      isAllDay ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${
                        isAllDay ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* 日付＋時刻 1行表示 */}
                <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
                  {/* 日付部分 */}
                  <div
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="flex-1 px-5 py-4 rounded-[14px] cursor-pointer active:bg-gray-200 dark:active:bg-gray-700"
                  >
                    <span className="font-medium text-base">
                      {format(selectedDate, 'EEE MMM d', { locale: enUS })}
                    </span>
                  </div>

                                    {/* 時刻部分（タップ重複防止版） */}
                  {!isAllDay && (
                    <div
                      onClick={() => setShowTimePicker(!showTimePicker)}
                      className="flex-1 px-5 py-4 rounded-[14px] cursor-pointer active:bg-gray-200 dark:active:bg-gray-700 text-right"
                    >
                      <span className="font-medium text-base text-blue-600 dark:text-blue-400">
                        {selectedHour.toString().padStart(2, '0')}:{(selectedMinute * 5).toString().padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                {/* 日付カレンダー */}
                {showDatePicker && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
                    <DayPicker
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setShowDatePicker(false);
                        }
                      }}
                      className="mx-auto"
                    />
                  </div>
                )}

                {/* 時刻ローラー（暴走完全防止版・中央表示） */}
                {showTimePicker && !isAllDay && (
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 mt-1">
                    <div className="flex justify-center gap-8 relative">
                      {/* 時間ローラー */}
                      <div className="text-center w-20">
                        <div
                          className="h-52 overflow-y-auto snap-y snap-mandatory relative pt-12"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                          onScroll={(e) => {
                            const scrollTop = e.currentTarget.scrollTop;
                            const index = Math.round(scrollTop / 56);
                            const newHour = index % 24;
                            if (selectedHour !== newHour) setSelectedHour(newHour);
                          }}
                        >
                          {Array.from({ length: 48 }, (_, i) => {
                            const hour = i % 24;
                            return (
                              <div
                                key={i}
                                className={`h-14 flex items-center justify-center text-2xl font-light snap-center transition-all ${
                                  selectedHour === hour ? 'text-3xl font-bold text-blue-600 scale-110' : 'opacity-40'
                                }`}
                              >
                                {hour.toString().padStart(2, '0')}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 分ローラー */}
                      <div className="text-center w-20">
                        <div
                          className="h-52 overflow-y-auto snap-y snap-mandatory relative pt-12"
                          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                          onScroll={(e) => {
                            const scrollTop = e.currentTarget.scrollTop;
                            const index = Math.round(scrollTop / 56);
                            const newMin = (index % 12) * 5;
                            if (selectedMinute * 5 !== newMin) setSelectedMinute(newMin / 5);
                          }}
                        >
                          {Array.from({ length: 48 }, (_, i) => {
                            const min = (i % 12) * 5;
                            return (
                              <div
                                key={i}
                                className={`h-14 flex items-center justify-center text-2xl font-light snap-center transition-all ${
                                  selectedMinute === min / 5 ? 'text-3xl font-bold text-blue-600 scale-110' : 'opacity-40'
                                }`}
                              >
                                {min.toString().padStart(2, '0')}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* ==================== 日時指定エリア ここまで ==================== */}

              {/* 新規モーダル内の保存ボタン部分（該当箇所を丸ごと置き換え） */}
                            <div className="flex gap-4 mt-10">
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetModalForm();           {/* ← これで一括リセット（キャンセルが正常に反応） */}
                  }}
                  className="flex-1 py-4 text-gray-500 font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveTask}
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-medium"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 右スワイプ確認ポップアップ */}
      <AnimatePresence>
        {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center px-4">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            className="bg-white dark:bg-gray-900 rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl"
          >
            <p className="text-xl font-bold mb-8">このタスクをどうしますか？</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  handleDeleteFromDetail(selectedTaskId!);   // ← toggleComplete → handleDeleteFromDetail に修正
                  setShowConfirmModal(false);
                  setSwipeDirection(null);
                  setSelectedTaskId(null);
                  setIsDragging(false);
                }}
                className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium transition"
              >
                削除する
              </button>

              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setSwipeDirection(null);
                  setSelectedTaskId(null);
                  setIsDragging(false);
                }}
                className="w-full py-4 text-gray-500 font-medium"
              >
                キャンセル
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* ハンバーガーメニュー */}
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 bg-black/70 z-[70]" onClick={() => setIsMenuOpen(false)}>
            <motion.div
              initial={{ x: 300 }}
              animate={{ x: 0 }}
              exit={{ x: 300 }}
              className="absolute right-0 top-0 h-full w-72 bg-white dark:bg-gray-900 p-8 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setIsMenuOpen(false)}
                className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
              >
                <X size={28} />
              </button>

              <h3 className="text-xl font-bold mb-8 mt-2">メニュー</h3>

              <div className="space-y-6 text-lg">
                {/* ホームボタン：ホーム画面のときだけ非表示 */}
                {!(currentView === 'home' && !isFromCalendar) && (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setCurrentView('home');
                      setCurrentDate(new Date());
                      setIsFromCalendar(false);
                    }}
                    className="block py-3 hover:text-blue-600 transition w-full text-left"
                  >
                    🏠 ホーム
                  </button>
                )}

                {/* カレンダーボタン：カレンダー画面のときだけ非表示 */}
                {currentView !== 'calendar' && (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setCurrentView('calendar');
                      setIsFromCalendar(false);
                    }}
                    className="block py-3 hover:text-blue-600 transition w-full text-left"
                  >
                    📅 カレンダー
                  </button>
                )}

                {/* タスク一覧ボタン */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setCurrentView('task-list');
                    setTaskListMonth(new Date());
                  }}
                  className="block py-3 hover:text-blue-600 transition w-full text-left"
                >
                  📋 タスク一覧
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

            {/* 詳細表示モーダル */}
      <AnimatePresence>
        {isDetailModalOpen && selectedTaskForDetail && (
          <div className="fixed inset-0 bg-black/60 z-[75] flex items-end">
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="bg-white dark:bg-gray-900 w-full max-w-md mx-auto rounded-t-3xl p-8 max-h-[85vh] overflow-y-auto"
            >
              {/* 日付＋時刻 */}
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">
                {format(new Date(selectedTaskForDetail.date), 'yyyy年M月d日 EEE', { locale: enUS })}
                {selectedTaskForDetail.time ? ` ・ ${selectedTaskForDetail.time}` : ' ・ 終日'}
              </div>

              {/* タイトル */}
              <h2 className="text-2xl font-bold mb-6">{selectedTaskForDetail.title}</h2>

              {/* 詳細全文 */}
              <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap text-base leading-relaxed mb-10">
                {selectedTaskForDetail.detail}
              </div>

              {/* アクションボタン */}
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => handleCompleteFromDetail(selectedTaskForDetail.id)}
                  className="py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-medium flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} />
                  完了
                </button>
                <button
                  onClick={() => openEditModal(selectedTaskForDetail)}
                  className="py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-medium flex items-center justify-center gap-2"
                >
                  <span>編集</span>
                </button>
                <button
                  onClick={() => handleDeleteFromDetail(selectedTaskForDetail.id)}
                  className="py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium flex items-center justify-center gap-2"
                >
                  <span>削除</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedTaskForDetail(null);
                }}
                className="w-full mt-6 py-4 text-gray-500 font-medium"
              >
                閉じる
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 日付選択カレンダーモーダル */}
      <AnimatePresence>
        {isCalendarOpen && (
          <div className="fixed inset-0 bg-black/60 z-65 flex items-end">
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="bg-white dark:bg-gray-900 w-full max-w-md mx-auto rounded-t-3xl p-6 flex flex-col"
              style={{ minHeight: '520px' }}
            >
              {/* ヘッダー（位置固定） */}
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">日付を選択</h3>
                <button
                  onClick={() => setIsCalendarOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={28} />
                </button>
              </div>

              {/* カレンダー本体：高さ固定コンテナ */}
              <div className="flex-1 min-h-[410px] flex items-start justify-center overflow-hidden">
                <DayPicker
                  mode="single"
                  selected={currentDate}
                  onSelect={(date) => {
                    if (date) {
                      setCurrentDate(date);
                      setIsCalendarOpen(false);
                    }
                  }}
                  showOutsideDays={true}
                  classNames={{
                    // ★★★ ここを修正 ★★★
                    outside: 'text-gray-800 dark:text-gray-700 font-bold',   // 先月・次月の日付を暗く（薄く）
                  }}
                  className="mx-auto"
                  today={new Date()}
                />
              </div>

              {/* 下部ボタン */}
              <div className="mt-8 flex gap-4">
                <button
                  onClick={() => setIsCalendarOpen(false)}
                  className="flex-1 py-4 text-gray-500 font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    setCurrentDate(new Date());
                    setIsCalendarOpen(false);
                  }}
                  className="flex-1 py-4 bg-gray-200 dark:bg-gray-700 rounded-2xl font-medium"
                >
                  今日に戻る
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ====================== タスク一覧用 月選択モーダル（コンパクト版・月のみ） ====================== */}
      <AnimatePresence>
        {showTaskListMonthPicker && (
          <div className="fixed inset-0 bg-black/60 z-65 flex items-end">
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="bg-white dark:bg-gray-900 w-full max-w-md mx-auto rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
            >
              {/* ヘッダー（新規作成モーダルと統一感） */}
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-2xl font-bold">月を選択</h3>
                <button
                  onClick={() => setShowTaskListMonthPicker(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X size={28} />
                </button>
              </div>

              {/* 年切り替えバー */}
              <div className="flex items-center justify-between mb-5 px-2">
                <button
                  onClick={() => setTaskListMonth(subMonths(taskListMonth, 12))}
                  className="text-blue-600 dark:text-blue-400 text-2xl px-4 active:scale-95"
                >
                  ‹
                </button>
                <div className="text-2xl font-semibold tracking-tight">
                  {format(taskListMonth, 'yyyy年', { locale: enUS })}
                </div>
                <button
                  onClick={() => setTaskListMonth(addMonths(taskListMonth, 12))}
                  className="text-blue-600 dark:text-blue-400 text-2xl px-4 active:scale-95"
                >
                  ›
                </button>
              </div>

              {/* 月グリッド（3列×4行） */}
              <div className="grid grid-cols-3 gap-3 px-2">
                {Array.from({ length: 12 }, (_, i) => {
                  const monthDate = new Date(taskListMonth.getFullYear(), i, 1);
                  const isCurrent =
                    taskListMonth.getFullYear() === monthDate.getFullYear() &&
                    taskListMonth.getMonth() === monthDate.getMonth();

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setTaskListMonth(monthDate);
                        setShowTaskListMonthPicker(false);
                      }}
                      className={`py-6 rounded-3xl text-center font-medium text-lg transition-all active:scale-95 ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {format(monthDate, 'M月', { locale: enUS })}
                    </button>
                  );
                })}
              </div>

              {/* 下部アクションボタン */}
              <div className="mt-5 flex gap-4">
                <button
                  onClick={() => setShowTaskListMonthPicker(false)}
                  className="flex-1 py-4 text-gray-500 font-medium"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    setTaskListMonth(new Date()); // 今月に戻る
                    setShowTaskListMonthPicker(false);
                  }}
                  className="flex-1 py-4 bg-gray-200 dark:bg-gray-700 rounded-2xl font-medium"
                >
                  今月に戻る
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
