'use client';

import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useEffect, useState, memo, useRef, useMemo } from 'react';
import { addReportTab, deleteReportTab, updateReportTabOrder, saveReport, getGeminiModels, getGeminiPrompts, getResolvedReportUrlAction, getAdjacentReportIdsAction, toggleLikeAction, addToQueue, getQueueItems, retryGeminiTaskAction, deleteReport, sendBatchEmailAction, updateReportContentAction } from '@/lib/db';
import { cn, formatDateToYMD, getLongPressHandlers } from '@/lib/utils';
import { showToast } from '@/components/Toast';
import TabManagementModal from '@/components/TabManagementModal';
import { useSearchParams, useRouter } from 'next/navigation';
import { marked } from 'marked';
import QueueStatus from '@/components/QueueStatus';
import ViewModeToggle from '@/components/ViewModeToggle';
import Link from 'next/link';

interface Report {
  id: string;
  index: string;
  date: string;
  title: string;
  author: string;
  institution: string;
  itemName?: string;
  itemCode?: string;
  item_name?: string;
  item_code?: string;
  categoryName?: string;
  fileId?: string;
  fileNum?: string;
  scrapPath?: string;
  hasFile: boolean;
  fileSize?: string;
  is_liked?: boolean;
  summary?: string;
  gemini_model?: string;
  url?: string;
  naverUrl?: string;
  researchId?: string;
  category?: string;
}

interface ReportContent {
  id: string;
  content: string;
}

export default function ReportClient({
  session,
  initialTabs,
  initialSavedReports
}: {
  session: any;
  initialTabs: any[];
  initialSavedReports: any[];
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [tabs, setTabs] = useState<any[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showTabManager, setShowTabManager] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [newTabUrl, setNewTabUrl] = useState('');
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [lastId, setLastId] = useState('0');
  const [hasMore, setHasMore] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [sortType, setSortType] = useState<'date' | 'size-asc' | 'size-desc'>('date');
  const [viewingContent, setViewingContent] = useState<ReportContent | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'my' | 'recommend'>('recommend');

  // Inline collapsible states
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [isInlineLoading, setIsInlineLoading] = useState<boolean>(false);

  // Search/Filter State
  const [srhWord, setSrhWord] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const searchParams = useSearchParams();
  const router = useRouter();

  // Interaction State
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set(initialSavedReports.map(r => `${r.title}|${r.institution}`)));
  const [savedReports, setSavedReports] = useState<any[]>(initialSavedReports);
  const [isCopying, setIsCopying] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedMyIds, setSelectedMyIds] = useState<string[]>([]);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isProcessing = isEmailing || isDeleting;

  // Detail View State
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedRecommendReport, setSelectedRecommendReport] = useState<Report | null>(null);

  // Navigation states
  const [adjacentIds, setAdjacentIds] = useState<{ prevId?: string; prevTitle?: string; nextId?: string; nextTitle?: string }>({});
  const [currentQueueItem, setCurrentQueueItem] = useState<any>(null);
  const [lastProcessedAt, setLastProcessedAt] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useRef<HTMLDivElement | null>(null);

  const selectedSavedReport = useMemo(() => {
      if (selectedReportId) return initialSavedReports.find(r => r.id === selectedReportId);
      if (selectedRecommendReport) return initialSavedReports.find(r => r.title === selectedRecommendReport.title && r.institution === selectedRecommendReport.institution);
      return null;
  }, [selectedReportId, selectedRecommendReport, initialSavedReports]);
  const isDetailView = !!selectedReportId || !!selectedRecommendReport;

  useEffect(() => {
    const urlId = searchParams.get('id');
    if (urlId) {
      setSelectedReportId(urlId);
    }

    const savedTab = localStorage.getItem('report_active_tab');
    if (savedTab && tabs.some(t => t.id === savedTab)) {
      setActiveTabId(savedTab);
    } else if (tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }

    const savedViewMode = localStorage.getItem('report_view_mode');
    if (savedViewMode === 'my' || savedViewMode === 'recommend') {
      setViewMode(savedViewMode);
    }
  }, [tabs, searchParams]);

  useEffect(() => {
    localStorage.setItem('report_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem('report_active_tab', activeTabId);
      fetchReports(true);
    } else if (tabs.length === 0) {
      setIsLoading(false);
    }
  }, [activeTabId, srhWord]);

  const handleSearch = () => {
    setSrhWord(searchInput);
  };

  const fetchReports = async (isInitial = false) => {
    if (!activeTabId && tabs.length > 0) return;

    const nextPage = isInitial ? 1 : page + 1;

    if (isInitial) {
      setIsLoading(true);
      setReports([]);
      setPage(1);
      setHasMore(true);
    } else {
      if (!hasMore || isMoreLoading) return;
      setIsMoreLoading(true);
    }

    try {
      const activeTab = tabs.find(t => t.id === activeTabId);
      const category = activeTab?.url || 'company';

      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: category,
          page: nextPage,
          pageSize: 20,
          srhWord
        })
      });

      const data = await res.json();
      if (Array.isArray(data)) {
        if (data.length === 0) {
          setHasMore(false);
        } else {
          if (isInitial) {
            setReports(data);
          } else {
            setReports(prev => [...prev, ...data]);
          }
          setPage(nextPage);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error(err);
      setHasMore(false);
    } finally {
      setIsLoading(false);
      setIsMoreLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRecommendReport || selectedReportId || isLoading || isMoreLoading || !hasMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        fetchReports(false);
      }
    });

    if (lastElementRef.current) {
      observer.current.observe(lastElementRef.current);
    }
  }, [reports, isLoading, isMoreLoading, hasMore, selectedRecommendReport, selectedReportId]);

  const fetchContent = async (reportId: string) => {
    if (viewingContent?.id === reportId) {
      return;
    }

    setIsContentLoading(true);
    setIsDetailLoading(true);
    try {
      const [adj, { items, lastProcessedAt: last }] = await Promise.all([
        getAdjacentReportIdsAction(reportId),
        getQueueItems()
      ]);
      setAdjacentIds(adj);

      const qItem = items.find(i => i.type === 'report' && i.target_id === reportId);
      setCurrentQueueItem(qItem || null);
      setLastProcessedAt(last);

      if (selectedSavedReport) {
        if (selectedSavedReport.content && selectedSavedReport.content.trim().length > 0) {
          setViewingContent({ id: reportId, content: selectedSavedReport.content });
        } else {
          const numToFetch = selectedSavedReport.research_id || selectedSavedReport.researchId || reportId;
          const reportCategory = selectedSavedReport.category || selectedSavedReport.fileNum || 'company';

          const res = await fetch('/api/report/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ num: numToFetch, category: reportCategory })
          });
          const html = await res.text();
          setViewingContent({ id: reportId, content: html });

          if (html && !html.startsWith('<p>내용을 불러올 수 없습니다.')) {
            await updateReportContentAction(selectedSavedReport.id, html);
          }
        }
      } else {
        const numToFetch = selectedRecommendReport?.researchId || reportId;
        const reportCategory = selectedRecommendReport?.fileNum || selectedRecommendReport?.category || 'company';

        const res = await fetch('/api/report/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ num: numToFetch, category: reportCategory })
        });
        const html = await res.text();
        setViewingContent({ id: reportId, content: html });
      }
    } catch (err) {
      console.error(err);
      showToast('내용을 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsContentLoading(false);
      setIsDetailLoading(false);
    }
  };

  const handleRecommendClick = (report: Report) => {
    setSelectedRecommendReport(report);
    fetchContent(report.id);
  };

  const handleTitleClick = async (report: Report) => {
    if (expandedReportId === report.id) {
      setExpandedReportId(null);
      setExpandedContent(null);
      return;
    }

    setExpandedReportId(report.id);
    setExpandedContent(null);
    setIsInlineLoading(true);

    try {
      const res = await fetch('/api/report/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num: report.id, category: report.fileNum || 'company' })
      });
      const html = await res.text();
      setExpandedContent(html);
    } catch (err) {
      console.error(err);
      showToast('내용을 불러오는 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsInlineLoading(false);
    }
  };


  const handleCopyUrl = (url?: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL이 복사되었습니다.');
    }).catch(err => {
      console.error('Copy failed:', err);
      showToast('URL 복사에 실패했습니다.', 'error');
    });
  };

  const handleDownload = async (report: any) => {
    if (!report?.url) return;

    try {
      const cleanDate = (report.date || '').replace(/[^0-9]/g, '');
      let baseName = '';

      if (report.itemName) {
        const itemCodeStr = report.itemCode ? ` (${report.itemCode})` : '';
        baseName = `${report.itemName}${itemCodeStr}_${report.title}_${report.institution}_${cleanDate}`;
      } else {
        const catName = report.categoryName || '리포트';
        baseName = `${catName}_${report.title}_${report.institution}_${cleanDate}`;
      }

      const safeFilename = baseName.replace(/[\\/:*?"<>|]/g, '_').trim() + '.pdf';
      const downloadProxyUrl = `/api/report/download?url=${encodeURIComponent(report.url)}&filename=${encodeURIComponent(safeFilename)}`;

      window.open(downloadProxyUrl, '_blank');
    } catch (error) {
      console.error('Download error:', error);
      showToast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleToggleLike = async (report: any) => {
    if (!report || isLiking) return;
    setIsLiking(true);
    const newLiked = !report.is_liked;
    try {
      const res = await toggleLikeAction('report', report.id, newLiked);
      if (res.success) {
        showToast(newLiked ? '좋아요 항목에 추가되었습니다.' : '좋아요가 취소되었습니다.');
        router.refresh();
      } else {
        showToast(res.error || '실패했습니다.', 'error');
      }
    } catch (err) {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleSaveReport = async (report: Report) => {
    if (!session) {
      showToast('로그인이 필요한 서비스입니다.', 'info');
      return;
    }

    setSavingId(report.id);
    try {
      const models = await getGeminiModels();
      const prompts = await getGeminiPrompts();
      const selectedModel = models.find(m => m.report_default)?.name || models[0]?.name || "gemini-1.5-flash";
      const selectedPrompt = prompts.find(p => p.report_default)?.content || prompts[0]?.content;

      const pdfUrl = report.url || '';

      const result = await saveReport({
        title: report.title,
        author: report.author,
        institution: report.institution,
        date: report.date,
        url: pdfUrl,
        summary: '',
        content: viewingContent?.id === report.id ? viewingContent.content : '',
        itemName: report.itemName,
        itemCode: report.itemCode,
        researchId: report.researchId || report.id,
        category: report.fileNum || report.category || 'company'
      });

      if (result.success && result.id) {
        await addToQueue('report', result.id, {
          url: pdfUrl,
          model: selectedModel,
          prompt: selectedPrompt
        });
        setSavedKeys(prev => new Set([...Array.from(prev), `${report.title}|${report.institution}`]));
        showToast('내 서재에 추가되었습니다. 요약은 잠시 후 완료됩니다.');
      } else {
        showToast(`저장 실패: ${result.error}`, 'error');
      }
    } catch (error: any) {
      console.error(error);
      showToast(`리포트 저장에 실패했습니다: ${error.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleAddTab = async () => {
    if (!newTabName || !newTabUrl) return;
    setIsAddingTab(true);
    const res = await addReportTab(newTabName, newTabUrl);
    if (res.success && res.id) {
      setNewTabName('');
      setNewTabUrl('');
      const newTab = { id: res.id, name: newTabName, url: newTabUrl, position: tabs.length };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(res.id);
      setShowTabManager(false);
      showToast('탭이 추가되었습니다.');
    } else {
      showToast(res.error || '탭 추가 실패', 'error');
    }
    setIsAddingTab(false);
  };

  const handleDeleteTab = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('탭을 삭제하시겠습니까?')) return;
    const res = await deleteReportTab(id);
    if (res.success) {
      const remainingTabs = tabs.filter(t => t.id !== id);
      setTabs(remainingTabs);
      if (activeTabId === id) {
        setActiveTabId(remainingTabs.length > 0 ? remainingTabs[0].id : null);
      }
      showToast('탭이 삭제되었습니다.');
    } else {
      showToast(res.error || '삭제 실패', 'error');
    }
  };

  const handleTabLongPress = (id: string) => {
    setIsModalOpen(true);
  };

  const moveTab = (draggedId: string, hoverId: string) => {
    const draggedIndex = tabs.findIndex(t => t.id === draggedId);
    const hoverIndex = tabs.findIndex(t => t.id === hoverId);
    const newTabs = [...tabs];
    const [draggedTab] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(hoverIndex, 0, draggedTab);
    setTabs(newTabs);
  };

  const saveTabOrder = async () => {
    const orders = tabs.map((tab, index) => ({ id: tab.id, position: index }));
    const res = await updateReportTabOrder(orders);
    if (!res.success) {
      showToast(res.error || '저장 실패', 'error');
    }
  };

  const parseSize = (sizeStr?: string) => {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr);
    if (sizeStr.includes('MB')) return num * 1024 * 1024;
    if (sizeStr.includes('KB')) return num * 1024;
    return num;
  };

  const sortedReports = useMemo(() => {
    if (sortType === 'date') return reports;

    return [...reports].sort((a, b) => {
      const sizeA = parseSize(a.fileSize);
      const sizeB = parseSize(b.fileSize);
      return sortType === 'size-asc' ? sizeA - sizeB : sizeB - sizeA;
    });
  }, [reports, sortType]);

  useEffect(() => {
    if (selectedReportId && !selectedRecommendReport) {
      fetchContent(selectedReportId);
    }
  }, [selectedReportId, selectedRecommendReport]);

  const handleRetrySummary = async () => {
    const report = selectedRecommendReport || selectedSavedReport;
    if (!report || isRetrying) return;

    setIsRetrying(true);
    try {
      const res = await retryGeminiTaskAction('report', report.id);
      if (res.success) {
        showToast('재시도 작업이 큐에 추가되었습니다.');
        // Refresh queue status
        const { items, lastProcessedAt: last } = await getQueueItems();
        const qItem = items.find(i => i.type === 'report' && i.target_id === report.id);
        setCurrentQueueItem(qItem || null);
        setLastProcessedAt(last);
      } else {
        showToast(res.error || '재시도 실패', 'error');
      }
    } catch (err) {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!confirm('리포트를 삭제하시겠습니까?')) return;
    const res = await deleteReport(id);
    if (res.success) {
      showToast('삭제되었습니다.');
      setSelectedReportId(null);
      router.push('/saved?filter=report');
    } else {
      showToast(res.error || '삭제 실패', 'error');
    }
  };

  useEffect(() => {
    const updateCountdown = () => {
        if (!lastProcessedAt || !currentQueueItem || currentQueueItem.status === 'processing') {
            setTimeLeft(0);
            return;
        }

        const nextAllowed = new Date(lastProcessedAt).getTime() + 60000;
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((nextAllowed - now) / 1000));
        setTimeLeft(diff);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [lastProcessedAt, currentQueueItem]);

  return (
    <div className="font-display min-h-screen pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Header
        title={isDetailView ? "리포트 상세" : "리포트"}
        showBack={isDetailView}
        onBack={() => {
          if (selectedReportId) {
            router.push('/saved?filter=report');
          }
          setSelectedReportId(null);
          setSelectedRecommendReport(null);
        }}
        transparent
        rightAction={
          !isDetailView ? (
            viewMode === 'my' && isEditMode ? (
              <button
                onClick={() => { setIsEditMode(false); setSelectedMyIds([]); }}
                className="px-3 py-1 bg-primary text-white rounded-full text-xs font-bold mr-2"
              >
                취소
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => window.location.href = '/settings/gemini'}
                  className="text-primary p-2"
                  title="Gemini 설정"
                >
                  <span className="material-symbols-outlined text-2xl">settings_suggest</span>
                </button>
                <button
                  onClick={() => setShowTabManager(!showTabManager)}
                  className="text-primary p-2"
                >
                  <span className="material-symbols-outlined text-2xl">{showTabManager ? 'close' : 'add_circle'}</span>
                </button>
              </div>
            )
          ) : undefined
        }
      >
        {!isDetailView && (
          <ViewModeToggle
            title="리포트"
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        )}
      </Header>

      <main className="mt-4 px-4">
        {isDetailLoading ? (
          <SkeletonReportDetail />
        ) : selectedRecommendReport || (selectedReportId && selectedSavedReport) ? (
          <div className="space-y-6 animate-fade-in-up pb-20">
            {selectedReportId && (
              <div className="flex justify-between items-center gap-2 bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
                <button
                  onClick={() => adjacentIds.prevId && setSelectedReportId(adjacentIds.prevId)}
                  disabled={!adjacentIds.prevId}
                  className="flex-1 flex items-center gap-1 min-w-0 px-2 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:grayscale transition-all active:scale-95 text-left"
                  title={adjacentIds.prevTitle}
                >
                  <span className="material-symbols-outlined text-lg flex-shrink-0">chevron_left</span>
                  <span className="flex-shrink-0">이전</span>
                  {adjacentIds.prevTitle && (
                    <span className="truncate text-xs font-normal text-slate-400 dark:text-slate-500 min-w-0">
                      : {adjacentIds.prevTitle}
                    </span>
                  )}
                </button>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                <button
                  onClick={() => adjacentIds.nextId && setSelectedReportId(adjacentIds.nextId)}
                  disabled={!adjacentIds.nextId}
                  className="flex-1 flex items-center justify-end gap-1 min-w-0 px-2 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:grayscale transition-all active:scale-95 text-right"
                  title={adjacentIds.nextTitle}
                >
                  {adjacentIds.nextTitle && (
                    <span className="truncate text-xs font-normal text-slate-400 dark:text-slate-500 min-w-0">
                      {adjacentIds.nextTitle} :
                    </span>
                  )}
                  <span className="flex-shrink-0">다음</span>
                  <span className="material-symbols-outlined text-lg flex-shrink-0">chevron_right</span>
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={async () => {
                  setIsCopying(true);
                  const current = selectedRecommendReport || selectedSavedReport;
                  handleCopyUrl(current?.url || '');
                  setIsCopying(false);
                }}
                disabled={isCopying}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-[12px] disabled:opacity-50"
              >
                {isCopying ? (
                  <div className="size-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">content_copy</span>
                    URL
                  </>
                )}
              </button>

              {(selectedRecommendReport?.hasFile || selectedSavedReport?.url) && (
                <button
                  onClick={() => handleDownload(selectedRecommendReport || selectedSavedReport)}
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-[12px]"
                >
                  <span className="material-symbols-outlined text-lg">download</span>
                  PDF
                </button>
              )}

              {selectedSavedReport ? (
                <button
                  onClick={() => handleDeleteReport(selectedSavedReport.id)}
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold text-[12px]"
                >
                  <span className="material-symbols-outlined text-lg">delete</span>
                  삭제
                </button>
              ) : selectedRecommendReport && (
                <button
                  onClick={() => handleSaveReport(selectedRecommendReport)}
                  disabled={savingId === selectedRecommendReport.id}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-2.5 bg-primary text-white rounded-xl font-bold text-[12px] shadow-lg shadow-primary/10 disabled:opacity-50",
                    !selectedRecommendReport.hasFile && "col-span-2"
                  )}
                >
                  {savingId === selectedRecommendReport.id ? (
                    <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">auto_awesome</span>
                      저장
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-primary">{(selectedRecommendReport || selectedSavedReport).institution}</span>
                  {((selectedRecommendReport || selectedSavedReport).itemName || (selectedRecommendReport || selectedSavedReport).item_name) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                      {(selectedRecommendReport || selectedSavedReport).itemName || (selectedRecommendReport || selectedSavedReport).item_name}
                      {((selectedRecommendReport || selectedSavedReport).itemCode || (selectedRecommendReport || selectedSavedReport).item_code) ? ` (${(selectedRecommendReport || selectedSavedReport).itemCode || (selectedRecommendReport || selectedSavedReport).item_code})` : ''}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight break-words">
                  {(selectedRecommendReport || selectedSavedReport).title}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {(selectedRecommendReport || selectedSavedReport).author} • {(selectedRecommendReport || selectedSavedReport).date}
                </p>
              </div>
              {selectedSavedReport && (
                <button
                  onClick={() => handleToggleLike(selectedSavedReport)}
                  disabled={isLiking}
                  className={cn(
                    "flex-shrink-0 p-1.5 transition-all active:scale-125 disabled:opacity-50",
                    selectedSavedReport.is_liked ? "text-red-500" : "text-slate-300 dark:text-slate-700"
                  )}
                >
                  <span className={cn("material-symbols-outlined text-3xl", selectedSavedReport.is_liked && "fill-1")}>favorite</span>
                </button>
              )}
            </div>

            {(selectedSavedReport || currentQueueItem) && (
              <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-primary uppercase flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                            AI 요약 분석
                        </h3>
                        {selectedSavedReport?.summary && selectedSavedReport?.gemini_model && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 text-primary rounded uppercase tracking-tighter">
                                {selectedSavedReport.gemini_model}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {currentQueueItem && (
                            <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                currentQueueItem.status === 'processing' ? "bg-primary/10 text-primary animate-pulse" :
                                currentQueueItem.status === 'failed' ? "bg-red-100 text-red-600" :
                                "bg-slate-100 text-slate-500"
                            )}>
                                {currentQueueItem.status === 'processing' ? '처리 중' :
                                 currentQueueItem.status === 'failed' ? '실패' : '대기 중'}
                            </span>
                        )}
                        <button
                            onClick={handleRetrySummary}
                            disabled={isRetrying || currentQueueItem?.status === 'processing'}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold active:scale-95 transition-all disabled:opacity-50"
                        >
                            <span className={cn("material-symbols-outlined text-[14px]", isRetrying && "animate-spin")}>refresh</span>
                            다시 가져오기
                        </button>
                    </div>
                </div>

                {currentQueueItem?.status === 'failed' ? (
                    <div className="p-5 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            <p className="text-xs font-bold">분석 중 오류가 발생했습니다</p>
                        </div>
                        <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 relative group">
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap pr-10">
                                {currentQueueItem.error_message || '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
                            </p>
                            {currentQueueItem.error_message && (
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(currentQueueItem.error_message).then(() => {
                                            showToast('오류 메시지가 복사되었습니다.');
                                        });
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary rounded-lg transition-colors"
                                    title="오류 메시지 복사"
                                >
                                    <span className="material-symbols-outlined text-sm">content_copy</span>
                                </button>
                            )}
                        </div>
                        <button
                            onClick={handleRetrySummary}
                            disabled={isRetrying}
                            className="w-full py-2.5 bg-red-500 text-white text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {isRetrying ? (
                                <div className="size-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <span className="material-symbols-outlined text-sm">refresh</span>
                            )}
                            다시 시도
                        </button>
                    </div>
                ) : selectedSavedReport?.summary && (!currentQueueItem || currentQueueItem.status === 'completed') ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: marked.parse(selectedSavedReport.summary) }}
                    />
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400">
                        <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-medium">AI가 리포트를 분석하고 있습니다...</p>
                        {timeLeft > 0 ? (
                            <p className="text-[10px] text-primary font-bold">{timeLeft}초 후 분석 시작 예정</p>
                        ) : (
                            <p className="text-[9px] opacity-60">잠시만 기다려 주세요 (순차 처리 중)</p>
                        )}
                    </div>
                )}
              </div>
            )}

            {isContentLoading ? (
              <div className="p-10 flex flex-col items-center justify-center gap-4 text-slate-400">
                <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">내용을 불러오는 중...</p>
              </div>
            ) : viewingContent ? (
              <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-primary/10 overflow-hidden shadow-sm">
                <div
                  className="prose prose-sm dark:prose-invert max-w-none break-words p-6"
                  dangerouslySetInnerHTML={{ __html: viewingContent.content }}
                />
              </div>
            ) : (
              <div className="p-10 text-center text-slate-400">내용이 없습니다.</div>
            )}
          </div>
        ) : viewMode === 'recommend' ? (
          <>
            <div className="mb-6 space-y-3">
              <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-primary/10 p-4 shadow-sm">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="검색어를 입력하세요..."
                      className="w-full bg-slate-100 dark:bg-black/20 border-none rounded-xl py-3 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                    {searchInput && (
                      <button
                        onClick={() => { setSearchInput(''); setSrhWord(''); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">cancel</span>
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleSearch}
                    className="px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-sm active:scale-95 transition-all"
                  >
                    조회
                  </button>
                </div>
              </div>

              <div className="relative flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 overflow-x-auto no-scrollbar py-1 pr-10">
                  {tabs.map(tab => {
                    const longPressHandlers = getLongPressHandlers(() => handleTabLongPress(tab.id));
                    return (
                      <div
                        key={tab.id}
                        className="relative flex-shrink-0 group transition-all"
                        onContextMenu={(e) => e.preventDefault()}
                        {...longPressHandlers}
                      >
                        <button
                          onClick={() => setActiveTabId(tab.id)}
                          className={cn(
                            "px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all",
                            activeTabId === tab.id ? "bg-primary text-white shadow-md" : "bg-slate-200 dark:bg-black/30 text-slate-500 dark:text-slate-400"
                          )}
                        >
                          {tab.name}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center bg-background-light/90 dark:bg-background-dark/90 pl-2 py-1 z-10">
                  <button
                    onClick={() => {
                      if (sortType === 'date') setSortType('size-desc');
                      else if (sortType === 'size-desc') setSortType('size-asc');
                      else setSortType('date');
                    }}
                    className={cn(
                      "p-1.5 rounded-full transition-all active:scale-95",
                      sortType === 'date' ? "text-slate-400" : "text-primary bg-primary/10"
                    )}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {sortType === 'date' ? 'sort' : sortType === 'size-desc' ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {showTabManager && (
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-primary/10 space-y-3">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">리포트 URL 추가</p>
                <input
                  type="text"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
                  placeholder="탭 이름 (예: 채권)"
                  className="w-full rounded-xl border dark:border-primary/20 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={newTabUrl}
                  onChange={(e) => setNewTabUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
                  placeholder="리포트 Ajax URL"
                  className="w-full rounded-xl border dark:border-primary/20 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
                />
                <button
                  onClick={handleAddTab}
                  disabled={isAddingTab || !newTabName || !newTabUrl}
                  className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  {isAddingTab ? '추가 중...' : '탭 추가하기'}
                </button>
              </div>
            )}

        <QueueStatus type="report" />

            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <SkeletonReportItem key={i} />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-20 text-slate-400 dark:text-slate-600">
                <p>{tabs.length === 0 ? '탭을 추가해 주세요.' : '리포트 정보가 없습니다.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedReports.map((report, idx) => {
                  const isSaved = savedKeys.has(`${report.title}|${report.institution}`);
                  const savedReportObj = initialSavedReports.find(
                    (r) => r.title === report.title && r.institution === report.institution
                  );
                  return (
                  <div
                    key={report.id + idx}
                    className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl p-4 shadow-sm animate-fade-in-up hover:border-primary/20 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetUrl = report.naverUrl || `https://m.stock.naver.com/investment/research/${report.fileNum || 'company'}/${report.id}`;
                            window.open(targetUrl, '_blank');
                          }}
                          className="text-[10px] font-bold text-primary hover:underline active:scale-95 transition-all"
                          title="네이버 리포트 원문 페이지로 이동"
                        >
                          {report.categoryName || '리포트'}
                        </button>
                      </div>
                      {(report.itemName || report.item_name) && (
                        <span className="text-[10px] font-bold text-primary">
                          {report.itemName || report.item_name}
                          {(report.itemCode || report.item_code) ? ` (${report.itemCode || report.item_code})` : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-start gap-3 my-1">
                      <div onClick={() => handleTitleClick(report)} className="flex-1 cursor-pointer group">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                          {report.title}
                        </h3>
                      </div>
                    </div>

                    <div onClick={() => handleTitleClick(report)} className="flex justify-between items-center cursor-pointer mt-1">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          {report.institution}
                        </p>
                        <span className="text-[10px] text-slate-400">{report.date}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {report.hasFile && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(report); }}
                            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg font-bold text-[9px] border border-slate-100 dark:border-primary/5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap min-w-[48px]"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            {report.fileSize || 'PDF'}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                              if (isSaved) return;
                              e.stopPropagation(); handleSaveReport(report);
                          }}
                          disabled={savingId === report.id || isSaved}
                          className={cn(
                              "flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg font-bold text-[9px] transition-all whitespace-nowrap min-w-[48px] disabled:opacity-50",
                              isSaved
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                : "bg-primary text-white hover:bg-primary/90 active:scale-95 shadow-sm shadow-primary/10"
                          )}
                          title={isSaved ? "이미 저장됨" : "저장"}
                        >
                          {savingId === report.id ? (
                            <div className="size-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span className="material-symbols-outlined text-[14px]">{isSaved ? 'task_alt' : 'save'}</span>
                              {isSaved ? '저장됨' : '저장'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Content Area */}
                    {expandedReportId === report.id && (
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-primary/10 space-y-4 animate-fade-in-up">
                        {isInlineLoading ? (
                          <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                            <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-[11px]">내용을 불러오는 중...</p>
                          </div>
                        ) : (
                          <>
                            {/* If saved and has summary, show AI 요약 분석 */}
                            {savedReportObj && savedReportObj.summary && (
                              <div className="bg-slate-50 dark:bg-black/10 rounded-xl p-4 space-y-2 border border-slate-100 dark:border-primary/5">
                                <div className="flex items-center gap-1 text-[11px] font-black text-primary uppercase">
                                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                  AI 요약 분석
                                </div>
                                <div
                                  className="prose prose-sm dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: marked.parse(savedReportObj.summary) }}
                                />
                              </div>
                            )}

                            {/* Show original content text */}
                            {expandedContent ? (
                              <div className="bg-slate-50 dark:bg-black/10 rounded-xl p-4 border border-slate-100 dark:border-primary/5 overflow-hidden max-h-[350px] overflow-y-auto no-scrollbar">
                                <div className="text-[11px] font-black text-slate-400 uppercase mb-2 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[14px]">description</span>
                                  추출된 리포트 내용
                                </div>
                                <div
                                  className="prose prose-sm dark:prose-invert max-w-none break-words text-xs text-slate-700 dark:text-slate-300"
                                  dangerouslySetInnerHTML={{ __html: expandedContent }}
                                />
                              </div>
                            ) : (
                              <div className="py-4 text-center text-xs text-slate-400">내용이 없습니다.</div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )})}

                {hasMore && (
                  <div ref={lastElementRef} className="h-20 flex items-center justify-center">
                    {isMoreLoading && (
                      <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 pb-20">
            {!session?.user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl text-primary">lock</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">로그인이 필요합니다</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-8 px-8">저장된 리포트를 보려면 먼저 로그인해 주세요.</p>
                <Link
                  href="/login"
                  className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                >
                  로그인하기
                </Link>
              </div>
            ) : savedReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
                <span className="material-symbols-outlined text-6xl mb-4">description</span>
                <p>아직 저장된 리포트가 없습니다.</p>
                <p className="text-sm">새로운 리포트를 저장해 보세요!</p>
              </div>
            ) : (
              <div className="space-y-3 select-none">
                {savedReports.map((report: any) => {
                  const isSelected = selectedMyIds.includes(report.id);
                  const longPressHandlers = getLongPressHandlers(() => {
                    if (!isEditMode) {
                      setIsEditMode(true);
                      setSelectedMyIds([report.id]);
                    }
                  });

                  return (
                    <div
                      key={report.id}
                      className={cn(
                        "w-full text-left bg-white dark:bg-slate-900/50 rounded-2xl border p-4 shadow-sm transition-all relative",
                        isEditMode && isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-100 dark:border-primary/10"
                      )}
                      onContextMenu={(e) => e.preventDefault()}
                      {...longPressHandlers}
                    >
                      <button
                        onClick={() => {
                          if (isEditMode) {
                            setSelectedMyIds(prev => prev.includes(report.id) ? prev.filter(i => i !== report.id) : [...prev, report.id]);
                          } else {
                            setSelectedReportId(report.id);
                          }
                        }}
                        className="w-full text-left"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-bold text-primary">리포트</span>
                          {(report.item_name || report.itemName) && (
                            <span className="text-[10px] font-bold text-primary">
                              {report.item_name || report.itemName}
                              {(report.item_code || report.itemCode) ? ` (${report.item_code || report.itemCode})` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight mb-2 flex-1">
                            {report.title}
                          </h3>
                          {isEditMode && (
                            <div className={cn(
                              "size-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 mt-0.5",
                              isSelected ? "bg-primary border-primary text-white" : "border-slate-300 text-transparent"
                            )}>
                              <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <p className="text-[10px] text-slate-500 font-bold">{report.institution}</p>
                          <span className="text-[10px] text-slate-400">{report.date}</span>
                        </div>
                        {report.author && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{report.author}</p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Selection Mode Action Bar for My Saved Reports */}
      {isEditMode && viewMode === 'my' && !isDetailView && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 p-3.5 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-primary/10 z-40 shadow-lg animate-in slide-in-from-bottom duration-300">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 min-w-0">
              <span className="text-primary">{selectedMyIds.length}</span>개 선택됨
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (selectedMyIds.length === 0) return;
                  setIsEmailing(true);
                  try {
                    const email = localStorage.getItem('last_blog_email') || 'seokmin.kwon@samsung.com';
                    const items = selectedMyIds.map(id => ({ type: 'report' as const, id }));
                    const res = await sendBatchEmailAction(items, email);
                    if (res.success) {
                      showToast(`${selectedMyIds.length}개의 리포트가 메일로 발송되었습니다.`);
                      setIsEditMode(false);
                      setSelectedMyIds([]);
                    } else {
                      showToast(res.error || '발송 실패', 'error');
                    }
                  } catch (e: any) {
                    showToast('발송 중 오류가 발생했습니다.', 'error');
                  } finally {
                    setIsEmailing(false);
                  }
                }}
                disabled={selectedMyIds.length === 0 || isProcessing}
                className="px-4 py-2.5 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
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
                onClick={async () => {
                  if (selectedMyIds.length === 0) return;
                  if (!confirm(`${selectedMyIds.length}개의 리포트를 삭제하시겠습니까?`)) return;
                  setIsDeleting(true);
                  try {
                    for (const id of selectedMyIds) {
                      await deleteReport(id);
                    }
                    setSavedReports(prev => prev.filter(r => !selectedMyIds.includes(r.id)));
                    showToast('삭제되었습니다.');
                    setIsEditMode(false);
                    setSelectedMyIds([]);
                    router.refresh();
                  } catch (e) {
                    showToast('삭제 실패', 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={selectedMyIds.length === 0 || isProcessing}
                className="px-4 py-2.5 bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
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

      <BottomNav activeTab="report" />

      <TabManagementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tabs={tabs}
        onReorder={moveTab}
        onDelete={handleDeleteTab}
        onSave={saveTabOrder}
        title="리포트 탭 관리"
      />
    </div>
  );
}

export const SkeletonReportDetail = memo(() => (
  <div className="space-y-6 animate-fade-in-up pb-20">
    <div className="flex justify-between items-center bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
      <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
      <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
      <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
      <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
    </div>
    <div className="space-y-2">
      <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      <div className="h-8 w-3/4 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
    </div>
    <div className="h-48 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl animate-skeleton" />
    <div className="h-64 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl animate-skeleton" />
  </div>
));

export const SkeletonReportItem = memo(() => (
  <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl p-4 shadow-sm space-y-3">
    <div className="flex justify-between items-center">
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton w-1/4" />
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton w-1/5" />
    </div>
    <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton w-3/4" />
    <div className="flex justify-between items-center pt-1">
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton w-1/6" />
      <div className="flex gap-2">
        <div className="h-7 w-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-skeleton" />
        <div className="h-7 w-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-skeleton" />
      </div>
    </div>
  </div>
));
