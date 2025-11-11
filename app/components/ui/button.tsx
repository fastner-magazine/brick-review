import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: font-weight 600 (semibold) を標準化、アニメーション、レスポンシブ対応
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-all duration-300 ease-in-out focus-visible:outline-none disabled:cursor-not-allowed w-full min-h-[48px] text-[clamp(14px,3.5vw,16px)] px-[clamp(12px,3vw,16px)]",
  {
    variants: {
      variant: {
        // gradient: 青グラデーション（次へ進む等の主要アクション）
        gradient: [
          "bg-gradient-to-br from-[#007bff] to-[#0056b3]",
          "text-white border-none shadow-[0_4px_12px_rgba(0,123,255,0.25)]",
          "hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(0,123,255,0.35)]",
          "active:translate-y-0",
          "disabled:bg-gradient-to-br disabled:from-[#90caf9] disabled:to-[#64b5f6] disabled:shadow-none",
        ],
        // white: 白背景+青囲み（戻るボタン等の副次アクション）
        white: [
          "bg-white text-[#0056b3] border-2 border-[#007bff]",
          "hover:bg-[#f0f8ff] hover:translate-y-[-2px] hover:shadow-[0_4px_12px_rgba(0,123,255,0.15)]",
          "active:translate-y-0",
        ],
        // success: 緑グラデーション（送信完了、選択済み等の成功アクション）
        success: [
          "bg-gradient-to-br from-[#28a745] to-[#218838]",
          "text-white border-none shadow-[0_4px_12px_rgba(40,167,69,0.25)]",
          "hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(40,167,69,0.35)]",
          "active:translate-y-0",
          "disabled:bg-gradient-to-br disabled:from-[#a5d6a7] disabled:to-[#81c784] disabled:shadow-none",
        ],
        // default: neutral gray (後方互換)
        default: [
          "bg-gradient-to-br from-[#007bff] to-[#0056b3]",
          "text-white border-none shadow-[0_4px_12px_rgba(0,123,255,0.25)]",
          "hover:translate-y-[-2px] hover:shadow-[0_6px_16px_rgba(0,123,255,0.35)]",
          "active:translate-y-0",
          "disabled:bg-gradient-to-br disabled:from-[#90caf9] disabled:to-[#64b5f6] disabled:shadow-none",
        ],
        // outline: shadcn 標準バリアント
        outline: [
          "bg-white text-[#0056b3] border-2 border-[#007bff]",
          "hover:bg-[#f0f8ff] hover:translate-y-[-2px] hover:shadow-[0_4px_12px_rgba(0,123,255,0.15)]",
          "active:translate-y-0",
        ],
        // ghost: shadcn 標準バリアント
        ghost: "bg-white hover:bg-gray-100",
        // destructive: 赤系（削除やキャンセル）
        destructive: "bg-[#FA415A] !text-white hover:brightness-95",
      },
      size: {
        // responsive default: フル幅・最小高48px (ページ標準)
        default: "w-full min-h-[48px] px-[clamp(12px,3vw,16px)] text-[clamp(14px,3.5vw,16px)]",
        // shadcn互換サイズ
        sm: "h-8 px-3 text-sm w-auto min-h-0",
        md: "h-9 px-4 text-sm w-auto min-h-0",
        lg: "h-10 px-6 text-base w-auto min-h-0",
        icon: "h-9 w-9 p-0 w-auto min-h-0",
      },
    },
    defaultVariants: {
      variant: "gradient",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
