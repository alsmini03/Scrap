'use client';

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  transparent?: boolean;
  children?: React.ReactNode;
}

export default function Header({ title, showBack, onBack, rightAction, transparent, children }: HeaderProps) {
  const router = useRouter();

  return (
    <header className={cn(
      "sticky top-0 z-40 flex items-center p-4 justify-between border-b border-primary/10 transition-colors",
      transparent
        ? "bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md"
        : "bg-background-light dark:bg-background-dark"
    )}>
      <div className="flex size-10 shrink-0 items-center justify-start">
        {showBack ? (
          <button
            onClick={() => onBack ? onBack() : router.back()}
            className="text-slate-900 dark:text-slate-100 flex size-10 items-center justify-center hover:bg-primary/10 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        ) : (
          <div className="size-10 shrink-0" />
        )}
      </div>

      <div className="flex-1 flex items-center justify-center min-w-0">
        {children ? children : (
            <h1 className="text-xl font-bold leading-tight tracking-tight text-center truncate text-slate-900 dark:text-slate-100 px-2">
                {title}
            </h1>
        )}
      </div>

      <div className="flex items-center justify-end min-w-10 shrink-0">
        {rightAction || <div className="size-10 shrink-0" />}
      </div>
    </header>
  );
}
