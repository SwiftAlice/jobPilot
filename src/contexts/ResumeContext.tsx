'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ResumeData } from '@/types/resume-types';

interface ResumeContextType {
  resumeData: ResumeData | null;
  setResumeData: (data: ResumeData | null) => void;
  updateResumeData: (updates: Partial<ResumeData>) => void;
  clearResumeData: () => void;
  isLoading: boolean;
}

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

export function ResumeProvider({ children }: { children: React.ReactNode }) {
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load resume data from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem('resumeData');
      if (savedData) {
        setResumeData(JSON.parse(savedData));
      }
    } catch (error) {
      console.error('Error loading resume data from localStorage:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save resume data to localStorage whenever it changes
  useEffect(() => {
    if (resumeData && !isLoading) {
      try {
        localStorage.setItem('resumeData', JSON.stringify(resumeData));
      } catch (error) {
        console.error('Error saving resume data to localStorage:', error);
      }
    }
  }, [resumeData, isLoading]);

  const updateResumeData = (updates: Partial<ResumeData>) => {
    setResumeData(prev => prev ? { ...prev, ...updates } : null);
  };

  const clearResumeData = () => {
    setResumeData(null);
    try {
      localStorage.removeItem('resumeData');
    } catch (error) {
      console.error('Error clearing resume data from localStorage:', error);
    }
  };

  return (
    <ResumeContext.Provider
      value={{
        resumeData,
        setResumeData,
        updateResumeData,
        clearResumeData,
        isLoading,
      }}
    >
      {children}
    </ResumeContext.Provider>
  );
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (context === undefined) {
    throw new Error('useResume must be used within a ResumeProvider');
  }
  return context;
}
