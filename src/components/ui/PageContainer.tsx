import { cn } from "@/lib/cn";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "main";
}

export function PageContainer({
  children,
  className,
  as: Tag = "div",
}: PageContainerProps) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 2xl:max-w-[1440px]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
