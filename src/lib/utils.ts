// Utility functions for backend operations

/**
 * File handling utilities
 */
export class FileUtils {
  /**
   * Validate file type and size
   */
  static validateFile(file: File, allowedTypes: string[], maxSizeMB: number = 10): { isValid: boolean; error?: string } {
    // Check file type
    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: `File type not supported. Allowed types: ${allowedTypes.join(', ')}`
      };
    }

    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        isValid: false,
        error: `File size too large. Maximum size: ${maxSizeMB}MB`
      };
    }

    return { isValid: true };
  }

  /**
   * Get file extension from filename
   */
  static getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  /**
   * Generate unique filename
   */
  static generateUniqueFilename(originalName: string, prefix: string = 'resume'): string {
    const timestamp = Date.now();
    const extension = this.getFileExtension(originalName);
    return `${prefix}_${timestamp}.${extension}`;
  }

  /**
   * Convert file size to human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Data processing utilities
 */
export class DataUtils {
  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as T;
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as T;
    if (typeof obj === 'object') {
      const clonedObj = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
    return obj;
  }

  /**
   * Merge objects deeply
   */
  static deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = this.deepMerge((result as any)[key], source[key]);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any)[key] = source[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Remove empty fields from object
   */
  static removeEmptyFields<T>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    
    for (const key in obj) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        if (Array.isArray(obj[key])) {
          if ((obj[key] as unknown[]).length > 0) {
            result[key] = obj[key];
          }
        } else if (typeof obj[key] === 'object') {
          const cleaned = this.removeEmptyFields(obj[key]);
          if (Object.keys(cleaned).length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (result as any)[key] = cleaned;
          }
        } else {
          result[key] = obj[key];
        }
      }
    }
    
    return result;
  }

  /**
   * Generate unique ID
   */
  static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Sort array by multiple criteria
   */
  static sortByMultiple<T>(array: T[], criteria: Array<{ key: keyof T; order: 'asc' | 'desc' }>): T[] {
    return [...array].sort((a, b) => {
      for (const criterion of criteria) {
        const aVal = a[criterion.key];
        const bVal = b[criterion.key];
        
        if (aVal < bVal) return criterion.order === 'asc' ? -1 : 1;
        if (aVal > bVal) return criterion.order === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
}

/**
 * Text processing utilities
 */
export class TextUtils {
  /**
   * Extract sentences from text
   */
  static extractSentences(text: string): string[] {
    return text
      .replace(/([.!?])\s*(?=[A-Z])/g, '$1|')
      .split('|')
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length > 0);
  }

  /**
   * Extract words from text
   */
  static extractWords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Count word frequency
   */
  static countWordFrequency(text: string): { [key: string]: number } {
    const words = this.extractWords(text);
    const frequency: { [key: string]: number } = {};
    
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return frequency;
  }

  /**
   * Find most common words
   */
  static findMostCommonWords(text: string, count: number = 10): string[] {
    const frequency = this.countWordFrequency(text);
    const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    
    return Object.entries(frequency)
      .filter(([word]) => !commonWords.includes(word) && word.length > 3)
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([word]) => word);
  }

  /**
   * Clean and normalize text
   */
  static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\-.,!?]/g, '')
      .trim();
  }

  /**
   * Truncate text with ellipsis
   */
  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }
}

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number format
   */
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate date format (YYYY-MM)
   */
  static isValidDate(date: string): boolean {
    const dateRegex = /^\d{4}-\d{2}$/;
    if (!dateRegex.test(date)) return false;
    
    const [year, month] = date.split('-').map(Number);
    return year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
  }

  /**
   * Validate required fields
   */
  static validateRequiredFields<T>(obj: T, requiredFields: (keyof T)[]): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    
    requiredFields.forEach(field => {
      if (!obj[field] || (typeof obj[field] === 'string' && (obj[field] as string).trim() === '')) {
        missingFields.push(field as string);
      }
    });
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }
}

/**
 * Performance utilities
 */
export class PerformanceUtils {
  /**
   * Debounce function execution
   */
  static debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function execution
   */
  static throttle<T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Measure execution time
   */
  static async measureExecutionTime<T>(
    fn: () => Promise<T> | T,
    label: string = 'Execution'
  ): Promise<T> {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    
    console.log(`${label} took ${(end - start).toFixed(2)}ms`);
    return result;
  }
}

/**
 * Export all utility classes
 */
export const Utils = {
  file: FileUtils,
  data: DataUtils,
  text: TextUtils,
  validation: ValidationUtils,
  performance: PerformanceUtils,
};

export default Utils;
