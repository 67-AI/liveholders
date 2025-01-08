'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from '@tremor/react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      size="xs"
      variant="secondary"
      onClick={toggleTheme}
      className="fixed top-4 right-4 !p-2 rounded-full"
      icon={theme === 'light' ? Sun : Moon}
    />
  );
} 