'use client';

import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { getBlogById, deleteBlog, sendBlogEmailAction, getAdjacentBlogIdsAction, toggleLikeAction, processBlogSummaryAction } from '@/lib/db';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn, formatDateToYMD, isThumbnailInContent } from '@/lib/utils';
import { showToast } from '@/components/Toast';
import { marked } from 'marked';
import GeminiSettingsModal from '@/components/GeminiSettingsModal';

const SkeletonBlogDetail = () => (
  <div className="font-display min-h-screen pb-24 bg-white dark:bg-background-dark text-slate-900 dark:text-slate-100">
    <Header title="블로그 (저장)" showBack onBack={() => {}} />
    <main className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
        <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
        <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      </div>
      <div className="h-10 w-3/4 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      <div className="flex items-center gap-2 py-2 border-y border-slate-100 dark:border-primary/10">
        <div className="flex-1 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
        <div className="flex-1 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
        <div className="flex-1 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton" />
      </div>
      <div className="flex justify-between items-center">
        <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      </div>
      <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 rounded-2xl animate-skeleton" />
      <div className="space-y-4">
        <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      </div>
    </main>
    <BottomNav activeTab="blog" />
  </div>
);

export default function BlogDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [blog, setBlog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isAiRunning, setIsAiRunning] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);

  // Navigation states
  const [adjacentIds, setAdjacentIds] = useState<{ prevId?: string; prevTitle?: string; nextId?: string; nextTitle?: string }>({});
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('seokmin.kwon@samsung.com');

  useEffect(() => {
    const lastEmail = localStorage.getItem('last_blog_email');
    if (lastEmail) setRecipientEmail(lastEmail);
  }, []);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      const [data, adj] = await Promise.all([
          getBlogById(id),
          getAdjacentBlogIdsAction(id)
      ]);
      if (data) {
          setBlog(data);
          setAdjacentIds(adj);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) return <SkeletonBlogDetail />;
  if (!blog) notFound();

  const handleDelete = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      const res = await deleteBlog(blog.id);
      if (res.success) {
          router.push('/blog');
      }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(blog.url).then(() => {
        showToast('URL이 복사되었습니다.');
    });
  };

  const handleToggleLike = async () => {
    if (!blog || isLiking) return;
    setIsLiking(true);
    const newLiked = !blog.is_liked;
    try {
      const res = await toggleLikeAction('blog', blog.id, newLiked);
      if (res.success) {
        setBlog({ ...blog, is_liked: newLiked });
        showToast(newLiked ? '좋아요 항목에 추가되었습니다.' : '좋아요가 취소되었습니다.');
      } else {
        showToast(res.error || '실패했습니다.', 'error');
      }
    } catch (err) {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleSendEmail = async () => {
    const email = localStorage.getItem('last_blog_email') || 'seokmin.kwon@samsung.com';
    setIsSending(true);
    try {
      const res = await sendBlogEmailAction(blog.id, email);
      if (res.success) {
        showToast('메일이 발송되었습니다.');
      } else {
        showToast(res.error || '발송 실패', 'error');
      }
    } catch (err) {
      showToast('이메일 발송에 실패했습니다.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleRegenerateAi = async () => {
    if (isAiRunning) return;
    setIsAiRunning(true);
    try {
      showToast('AI 분석을 진행 중입니다...');
      const res = await processBlogSummaryAction(blog.id);
      if (res.success && res.summary) {
        setBlog({ ...blog, summary: res.summary, gemini_model: res.model });
        showToast('AI 요약 분석이 완료되었습니다.');
      } else {
        showToast(res.error || 'AI 요약 실패', 'error');
      }
    } catch (err) {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setIsAiRunning(false);
    }
  };

  return (
    <div className="font-display min-h-screen pb-24 bg-white dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Header
        onBack={() => router.push('/saved?filter=blog')}
        showBack
        rightAction={
            <button onClick={handleDelete} className="text-red-500 p-2" title="삭제"><span className="material-symbols-outlined">delete</span></button>
        }
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-center truncate text-slate-900 dark:text-slate-100">
            블로그 (저장)
          </h1>
          <button
            onClick={() => setIsGeminiModalOpen(true)}
            className="p-1 rounded-full text-primary hover:bg-primary/10 transition-colors shrink-0"
            title="Gemini 설정"
          >
            <span className="material-symbols-outlined text-xl">settings_suggest</span>
          </button>
        </div>
      </Header>

      <main className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex justify-between items-center gap-2 bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
            <button
                onClick={() => adjacentIds.prevId && router.push(`/blog/${adjacentIds.prevId}`)}
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
                onClick={() => adjacentIds.nextId && router.push(`/blog/${adjacentIds.nextId}`)}
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

        <div className="flex items-start gap-2">
            <h1 className="text-2xl font-bold leading-tight break-words flex-1">{blog.title}</h1>
            <button
                onClick={handleToggleLike}
                disabled={isLiking}
                className={cn(
                    "flex-shrink-0 p-1.5 transition-all active:scale-125 disabled:opacity-50",
                    blog.is_liked ? "text-red-500" : "text-slate-300 dark:text-slate-700"
                )}
            >
                <span className={cn("material-symbols-outlined text-3xl", blog.is_liked && "fill-1")}>favorite</span>
            </button>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 py-2 border-y border-slate-100 dark:border-primary/10">
          <a
            href={blog.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary/10 text-primary rounded-xl text-sm font-bold active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            원문 보기
          </a>
          <button
            onClick={handleCopyUrl}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-lg">content_copy</span>
            URL 복사
          </button>
          <button
            onClick={handleSendEmail}
            disabled={isSending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold active:scale-95 transition-all disabled:opacity-50"
          >
            {isSending ? (
                <div className="size-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
                <>
                <span className="material-symbols-outlined text-lg">mail</span>
                메일 보내기
                </>
            )}
          </button>
        </div>

        <div className="flex justify-between items-center text-sm">
            {blog.author && <p className="text-primary font-bold">{blog.author}</p>}
            <p className="text-slate-400">
                {formatDateToYMD(blog.published_at)}
            </p>
        </div>

        {blog.thumbnail && !isThumbnailInContent(blog.thumbnail, blog.content) && (
            <div className="w-full rounded-2xl overflow-hidden border border-slate-100 dark:border-primary/10">
                <img src={blog.thumbnail} alt="" className="w-full" referrerPolicy="no-referrer" />
            </div>
        )}

        {/* AI Summary Section */}
        {blog.summary ? (
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-100 dark:border-primary/10 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                <h3 className="text-xs font-bold text-primary uppercase">AI 요약 분석</h3>
                {blog.gemini_model && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 bg-primary/10 text-primary rounded uppercase tracking-tighter">
                    {blog.gemini_model}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRegenerateAi}
                  disabled={isAiRunning}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-primary/10 active:scale-95 transition-all disabled:opacity-50"
                >
                  <span className={cn("material-symbols-outlined text-[13px]", isAiRunning && "animate-spin")}>refresh</span>
                  다시 가져오기
                </button>
              </div>
            </div>
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: marked.parse(blog.summary) }}
            />
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={handleRegenerateAi}
              disabled={isAiRunning}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {isAiRunning ? (
                <div className="size-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
              )}
              AI 프롬프트 요약 실행
            </button>
          </div>
        )}

        <div
          className="prose dark:prose-invert prose-slate max-w-none pb-20 break-words overflow-x-hidden"
          dangerouslySetInnerHTML={{ __html: blog.content || '' }}
        />
      </main>

      <BottomNav activeTab="blog" />

      <GeminiSettingsModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        category="blog"
      />
    </div>
  );
}
