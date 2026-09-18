'use client';

import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useState, memo, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn, formatDateToYMD } from '@/lib/utils';
import Link from 'next/link';
import { sendBatchEmailAction, deleteBlog, deleteYoutubeVideo, deleteReport, toggleLikeAction, softDeleteBook } from '@/lib/db';
import { showToast } from '@/components/Toast';
import { useSearchParams } from 'next/navigation';

export const SkeletonSavedItem = memo(() => (
  <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-primary/10 p-3 flex items-center gap-3">
    <div className="size-12 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
    </div>
  </div>
));

export default function SavedClient({
  session,
  initialItems,
  initialQueueItems = []
}: {
  session: any;
  initialItems: any[];
  initialQueueItems?: any[];
}) {
  const [items, setItems] = useState<any[]>(initialItems);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{type: string, id: string}[]>([]);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isProcessing = isEmailing || isDeleting;
  const [activeFilter, setActiveFilter] = useState<'all' | 'youtube' | 'blog' | 'report' | 'book'>('all');
  const [isLikedOnly, setIsLikedOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const hasGeminiError = useMemo(() => {
    return initialQueueItems.some(q =>
        q.status === 'failed' &&
        (q.error_message?.includes('GoogleGenerativeAI') || q.error_message?.includes('Gemini'))
    );
  }, [initialQueueItems]);

  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{x: number, y: number} | null>(null);

  useEffect(() => {
    const savedFilter = localStorage.getItem('saved_active_filter');
    if (savedFilter && ['all', 'youtube', 'blog', 'report', 'book'].includes(savedFilter)) {
        setActiveFilter(savedFilter as any);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('saved_active_filter', activeFilter);
  }, [activeFilter]);

  const filteredItems = useMemo(() => {
      let result = items;
      if (activeFilter !== 'all') {
          result = result.filter(item => item.type === activeFilter);
      }
      if (isLikedOnly) {
          result = result.filter(item => item.is_liked);
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        result = result.filter(item => {
            const titleMatch = item.title?.toLowerCase().includes(query);
            const authorMatch = (item.author || item.institution || '').toLowerCase().includes(query);
            return titleMatch || authorMatch;
        });
      }
      return result;
  }, [items, activeFilter, isLikedOnly, searchQuery]);

  const toggleSelect = useCallback((type: string, id: string) => {
    setSelectedItems(prev => {
        const isAlreadySelected = prev.some(item => item.type === type && item.id === id);
        if (isAlreadySelected) {
            return prev.filter(item => !(item.type === type && item.id === id));
        } else {
            return [...prev, { type, id }];
        }
    });
  }, []);

  const addSelect = useCallback((type: string, id: string) => {
    setSelectedItems(prev => {
        const isAlreadySelected = prev.some(item => item.type === type && item.id === id);
        if (isAlreadySelected) return prev;
        return [...prev, { type, id }];
    });
  }, []);

  // --- Drag Selection Logic ---

  const handlePointerDown = (e: React.PointerEvent, type: string, id: string) => {
    if (e.button !== 0) return;

    startPosRef.current = { x: e.clientX, y: e.clientY };

    dragTimerRef.current = setTimeout(() => {
        setIsEditMode(true);
        setIsDragging(true);
        addSelect(type, id);

        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(50);
        }
    }, 600);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
        const element = document.elementFromPoint(e.clientX, e.clientY);
        const itemElement = element?.closest('[data-saved-item="true"]');
        if (itemElement) {
            const type = itemElement.getAttribute('data-type');
            const id = itemElement.getAttribute('data-id');
            if (type && id) {
                addSelect(type, id);
            }
        }
    };

    const onPointerUp = () => {
        setIsDragging(false);
        startPosRef.current = null;
        if (dragTimerRef.current) {
            clearTimeout(dragTimerRef.current);
            dragTimerRef.current = null;
        }
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
    };

    // Lock scrolling and selection during drag
    document.body.style.touchAction = 'none';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.body.style.touchAction = '';
        document.body.style.userSelect = '';
    };
  }, [isDragging, addSelect]);

  // Handle pointer move BEFORE dragging starts (to cancel long press)
  const handlePointerMoveRoot = (e: React.PointerEvent) => {
    if (!startPosRef.current || isDragging) return;

    const dist = Math.sqrt(
        Math.pow(e.clientX - startPosRef.current.x, 2) +
        Math.pow(e.clientY - startPosRef.current.y, 2)
    );
    if (dist > 10) {
        if (dragTimerRef.current) {
            clearTimeout(dragTimerRef.current);
            dragTimerRef.current = null;
        }
    }
  };

  const handlePointerUpRoot = () => {
    if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
    }
    startPosRef.current = null;
  };

  // --- End Drag Selection Logic ---

  const handleBatchEmail = async () => {
    if (selectedItems.length === 0) return;

    const email = localStorage.getItem('last_blog_email') || 'seokmin.kwon@samsung.com';

    setIsEmailing(true);
    try {
      const itemsToSend = selectedItems.map(item => ({
        type: item.type as 'youtube' | 'blog' | 'report' | 'book',
        id: item.id
      })).filter(i => i.type !== 'book'); // Books not supported in batch email yet
      const res = await sendBatchEmailAction(itemsToSend, email);
      if (res.success) {
        showToast('메일이 발송되었습니다.');
        setIsEditMode(false);
        setSelectedItems([]);
      } else {
        showToast(res.error || '발송 실패', 'error');
      }
    } catch (err: any) {
      showToast(`발송 실패: ${err.message}`, 'error');
    } finally {
      setIsEmailing(false);
    }
  };

  const handleBatchDelete = async () => {
      if (selectedItems.length === 0) return;
      if (!confirm(`선택한 ${selectedItems.length}개의 항목을 삭제하시겠습니까?`)) return;

      setIsDeleting(true);
      try {
          let successCount = 0;
          for (const item of selectedItems) {
              let res;
              if (item.type === 'blog') res = await deleteBlog(item.id);
              else if (item.type === 'youtube') res = await deleteYoutubeVideo(item.id);
              else if (item.type === 'report') res = await deleteReport(item.id);
              else if (item.type === 'book') {
                  await softDeleteBook(item.id);
                  res = { success: true };
              }

              if (res?.success) successCount++;
          }

          if (successCount > 0) {
              const selectedIds = selectedItems.map(si => si.id);
              setItems(prev => prev.filter(item => !selectedIds.includes(item.id)));
              showToast(`${successCount}개의 항목이 삭제되었습니다.`);
              setIsEditMode(false);
              setSelectedItems([]);
          } else {
              showToast('삭제에 실패했습니다.', 'error');
          }
      } catch (err) {
          console.error(err);
          showToast('삭제 중 오류가 발생했습니다.', 'error');
      } finally {
          setIsDeleting(false);
      }
  };

  const isItemSelected = (type: string, id: string) => {
    return selectedItems.some(item => item.type === type && item.id === id);
  };

  const handleToggleLike = async (type: 'youtube' | 'blog' | 'report' | 'book', id: string, currentLiked: boolean) => {
    const newLiked = !currentLiked;

    // Optimistic update
    setItems(prev => prev.map(item => {
        if (item.type === type && item.id === id) {
            return { ...item, is_liked: newLiked };
        }
        return item;
    }));

    try {
        const res = await toggleLikeAction(type, id, newLiked);
        if (!res.success) {
            // Revert on failure
            setItems(prev => prev.map(item => {
                if (item.type === type && item.id === id) {
                    return { ...item, is_liked: currentLiked };
                }
                return item;
            }));
            showToast(res.error || '실패했습니다.', 'error');
        }
    } catch (err) {
        // Revert on error
        setItems(prev => prev.map(item => {
            if (item.type === type && item.id === id) {
                return { ...item, is_liked: currentLiked };
            }
            return item;
        }));
        showToast('오류가 발생했습니다.', 'error');
    }
  };

  const filters = [
      { id: 'all', label: '전체' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'blog', label: '블로그' },
      { id: 'report', label: '리포트' },
      { id: 'book', label: 'Yes24' }
  ];

  return (
    <div
        className="font-display min-h-screen pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-x-hidden"
        onPointerMove={handlePointerMoveRoot}
        onPointerUp={handlePointerUpRoot}
        onPointerCancel={handlePointerUpRoot}
    >
      <Header
        title="저장된 항목"
        rightAction={
            isEditMode ? (
                <button
                    onClick={() => { setIsEditMode(false); setSelectedItems([]); }}
                    className="text-slate-500 font-bold px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg mr-2"
                >
                    취소
                </button>
            ) : (
                <button
                    onClick={() => window.location.href = '/add'}
                    className="text-primary p-2"
                    title="가져오기"
                >
                    <span className="material-symbols-outlined text-2xl">add_circle</span>
                </button>
            )
        }
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-center truncate text-slate-900 dark:text-slate-100">
                저장된 항목
            </h1>
            {hasGeminiError && (
                <span
                    className="material-symbols-outlined text-red-500 text-[20px] animate-pulse shrink-0"
                    title="제미나이 오류 발생"
                >
                    warning
                </span>
            )}
        </div>
      </Header>

      <main className="mt-4 px-4 select-none">
        {/* Search Bar */}
        <div className="mb-4 relative">
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="제목, 내용, 저자 검색..."
                className="w-full bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl py-3 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
            />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
            {searchQuery && (
                <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">cancel</span>
                </button>
            )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6 -mx-4 px-4 sticky top-[64px] bg-background-light dark:bg-background-dark z-10 py-2">
            <div className="flex flex-1 overflow-x-auto no-scrollbar gap-2 py-1 flex-nowrap">
                {filters.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveFilter(f.id as any)}
                        className={cn(
                            "px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                            activeFilter === f.id ? "bg-primary text-white shadow-md" : "bg-slate-200 dark:bg-black/30 text-slate-500 dark:text-slate-400"
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
            <button
                onClick={() => setIsLikedOnly(!isLikedOnly)}
                className={cn(
                    "flex-shrink-0 size-9 rounded-full flex items-center justify-center transition-all",
                    isLikedOnly ? "bg-red-500 text-white shadow-md" : "bg-slate-200 dark:bg-black/30 text-slate-400 dark:text-slate-500"
                )}
            >
                <span className={cn("material-symbols-outlined text-xl", isLikedOnly && "fill-1")}>favorite</span>
            </button>
        </div>


        {filteredItems.length === 0 ? (
          <div className="py-20 text-center text-slate-400">저장된 항목이 없습니다.</div>
        ) : (
          <div className="space-y-3 pb-20">
                {filteredItems.map((item) => {
                  const errorItem = initialQueueItems.find(q => q.target_id === item.id && q.status === 'failed');
                  return (
                    <SavedItem
                        key={`${item.type}-${item.id}`}
                        item={item}
                        isEditMode={isEditMode}
                        isSelected={isItemSelected(item.type, item.id)}
                        hasError={!!errorItem}
                        onPointerDown={handlePointerDown}
                        onToggleSelect={toggleSelect}
                        onToggleLike={handleToggleLike}
                    />
                  );
                })}
          </div>
        )}
      </main>

      {/* Fixed Bottom Selection Mode Action Bar */}
      {isEditMode && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 p-3.5 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-primary/10 z-40 shadow-lg animate-in slide-in-from-bottom duration-300">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 min-w-0">
              <span className="text-primary">{selectedItems.length}</span>개 선택됨
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedItems(selectedItems.length === filteredItems.length ? [] : filteredItems.map(v => ({ type: v.type, id: v.id })))}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs shadow-sm"
              >
                {selectedItems.length === filteredItems.length ? '전체 해제' : '전체 선택'}
              </button>
              <button
                onClick={handleBatchEmail}
                disabled={selectedItems.length === 0 || isProcessing}
                className="px-4 py-2 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
              >
                {isEmailing ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">mail</span>
                    메일
                  </>
                )}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedItems.length === 0 || isProcessing}
                className="px-4 py-2 bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
              >
                {isDeleting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="saved" />
    </div>
  );
}

const SavedItem = memo(({ item, isEditMode, isSelected, hasError, onPointerDown, onToggleSelect, onToggleLike }: any) => {
  let href = '';
  let icon = '';
  let iconColor = '';
  let typeLabel = '';

  if (item.type === 'youtube') {
    href = `/youtube/${item.id}`;
    icon = 'video_library';
    iconColor = 'text-red-500 bg-red-50 dark:bg-red-500/10';
    typeLabel = 'YouTube';
  } else if (item.type === 'blog') {
    href = `/blog/${item.id}`;
    icon = 'rss_feed';
    iconColor = 'text-green-500 bg-green-50 dark:bg-green-500/10';
    typeLabel = '블로그';
  } else if (item.type === 'report') {
    href = `/report?id=${item.id}`;
    icon = 'description';
    iconColor = 'text-blue-500 bg-blue-50 dark:bg-blue-500/10';
    typeLabel = '리포트';
  } else if (item.type === 'book') {
    href = `/book/${item.id}`;
    icon = 'menu_book';
    iconColor = 'text-amber-500 bg-amber-50 dark:bg-amber-500/10';
    typeLabel = 'Yes24';
  }

  return (
    <div
        className="relative animate-fade-in-up"
        data-saved-item="true"
        data-type={item.type}
        data-id={item.id}
        onPointerDown={(e) => onPointerDown(e, item.type, item.id)}
        onContextMenu={(e) => e.preventDefault()}
    >
      <Link
        href={isEditMode ? '#' : href}
        onClick={(e) => {
            if (isEditMode) {
                e.preventDefault();
                onToggleSelect(item.type, item.id);
            }
        }}
        className={cn(
          "flex items-center gap-3 bg-white dark:bg-slate-900/50 rounded-2xl border overflow-hidden shadow-sm active:scale-[0.98] transition-all relative group",
          isEditMode && isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-100 dark:border-primary/10"
        )}
      >
        {item.type === 'youtube' && item.thumbnail ? (
          <div className="relative shrink-0 w-32 aspect-video rounded-lg overflow-hidden border border-slate-100 dark:border-primary/5 bg-slate-100 dark:bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail}
              alt=""
              className="w-full h-full object-cover pointer-events-none"
              onError={(e: any) => {
                const videoId = item.url?.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{11})/)?.[1];
                if (videoId && !e.target.src.includes('mqdefault.jpg')) {
                    e.target.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
                }
              }}
            />
            <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] font-bold px-1 rounded">
                {item.duration}
            </div>
          </div>
        ) : (
          <div className={cn("size-12 shrink-0 rounded-xl flex items-center justify-center ml-3", iconColor)}>
            <span className="material-symbols-outlined pointer-events-none">{icon}</span>
          </div>
        )}

        <div className="flex-1 min-w-0 py-3 pointer-events-none">
          <div className="flex items-center justify-between gap-1.5 mb-0.5">
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase",
                item.type === 'youtube' ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                item.type === 'blog' ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                item.type === 'report' ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            )}>
                {typeLabel}
            </span>
            {item.type === 'report' && (item.item_name || item.itemName) && (
              <span className="text-[10px] font-bold text-primary truncate">
                {item.item_name || item.itemName}
                {(item.item_code || item.itemCode) ? ` (${item.item_code || item.itemCode})` : ''}
              </span>
            )}
          </div>
          <h3 className={cn(
            "text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 flex items-center gap-1 my-0.5",
            item.type === 'youtube' ? "text-[13px] font-normal" : "text-sm font-bold"
          )}>
            {item.title}
            {hasError && (
              <span className="material-symbols-outlined text-red-500 text-sm shrink-0" title="AI 요약 실패">error</span>
            )}
          </h3>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate min-w-0">
              {item.author || item.institution || ''}
            </p>
            <span className="text-[10px] text-slate-400 shrink-0">{item.date || formatDateToYMD(item.added_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 pr-2">
            {isEditMode ? (
                <div className={cn(
                    "size-5 rounded-full border-2 flex items-center justify-center transition-all mr-1",
                    isSelected ? "bg-primary border-primary" : "border-slate-200 dark:border-slate-700"
                )}>
                    {isSelected && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                </div>
            ) : (
                <button
                    onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleLike(item.type, item.id, item.is_liked);
                    }}
                    className={cn(
                    "size-9 flex items-center justify-center rounded-full transition-all active:scale-125 z-10",
                    item.is_liked ? "text-red-500 bg-red-50 dark:bg-red-500/10" : "text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800"
                    )}
                    title="좋아요"
                >
                    <span className={cn("material-symbols-outlined text-xl", item.is_liked && "fill-1")}>favorite</span>
                </button>
            )}
        </div>
      </Link>
    </div>
  );
});
