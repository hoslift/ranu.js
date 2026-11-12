import type { ReactNode } from 'react';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Button({
  children: _children,
  onClick: _onClick,
  className: _className,
}: ButtonProps) {
  return null; // Component placeholder
}

export default Button;
