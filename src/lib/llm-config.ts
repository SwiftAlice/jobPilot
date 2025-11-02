// LLM Configuration for Resume Parsing
// Switch between different models for speed vs quality trade-offs

export const LLM_MODELS = {
  // OpenAI Models (Fastest to Slowest)
  FASTEST: {
    name: 'gpt-3.5-turbo',
    description: 'Fastest OpenAI model - 3-5x faster than GPT-4o-mini',
    speed: 'Very Fast',
    quality: 'Good',
    cost: 'Low',
    estimatedTime: '5-10 seconds'
  },
  
  FAST: {
    name: 'gpt-4o-mini',
    description: 'Balanced speed and quality',
    speed: 'Fast',
    quality: 'Very Good',
    cost: 'Medium',
    estimatedTime: '10-20 seconds'
  },
  
  BALANCED: {
    name: 'gpt-4o-mini-2024-07-18',
    description: 'Latest optimized version',
    speed: 'Fast',
    quality: 'Very Good',
    cost: 'Medium',
    estimatedTime: '8-15 seconds'
  },
  
  QUALITY: {
    name: 'gpt-4o',
    description: 'Highest quality, slower',
    speed: 'Medium',
    quality: 'Excellent',
    cost: 'High',
    estimatedTime: '20-40 seconds'
  }
} as const;

// Alternative LLM Providers
export const ALTERNATIVE_PROVIDERS = {
  CLAUDE: {
    name: 'claude-3-haiku',
    provider: 'anthropic',
    description: 'Fastest Claude model',
    speed: 'Very Fast',
    quality: 'Good',
    estimatedTime: '5-8 seconds'
  },
  
  GEMINI: {
    name: 'gemini-1.5-flash',
    provider: 'google',
    description: 'Google\'s fastest model',
    speed: 'Very Fast',
    quality: 'Good',
    estimatedTime: '4-7 seconds'
  },
  
  LLAMA: {
    name: 'llama-3.1-8b',
    provider: 'replicate',
    description: 'Open source, fast',
    speed: 'Very Fast',
    quality: 'Good',
    estimatedTime: '3-6 seconds'
  }
} as const;

// Current configuration
export const CURRENT_MODEL = LLM_MODELS.FASTEST; // Change this to switch models

// Model-specific configurations
export const MODEL_CONFIGS = {
  'gpt-3.5-turbo': {
    maxTokens: 2000,
    temperature: 0.1,
    timeout: 45000, // 45 seconds
    pollingInterval: 500 // 500ms
  },
  'gpt-4o-mini': {
    maxTokens: 2000,
    temperature: 0.1,
    timeout: 20000, // 20 seconds
    pollingInterval: 1000 // 1 second
  },
  'gpt-4o-mini-2024-07-18': {
    maxTokens: 2000,
    temperature: 0.1,
    timeout: 15000, // 15 seconds
    pollingInterval: 500 // 500ms
  },
  'gpt-4o': {
    maxTokens: 2000,
    temperature: 0.1,
    timeout: 30000, // 30 seconds
    pollingInterval: 1000 // 1 second
  }
} as const;

// Get current model configuration
export function getCurrentModelConfig() {
  return MODEL_CONFIGS[CURRENT_MODEL.name as keyof typeof MODEL_CONFIGS] || MODEL_CONFIGS['gpt-3.5-turbo'];
}

// Performance recommendations based on use case
export const PERFORMANCE_RECOMMENDATIONS = {
  SPEED_PRIORITY: {
    model: 'gpt-3.5-turbo',
    reason: 'Fastest processing, good enough quality for resume parsing',
    estimatedTime: '5-10 seconds'
  },
  
  BALANCED: {
    model: 'gpt-4o-mini-2024-07-18',
    reason: 'Good balance of speed and quality',
    estimatedTime: '8-15 seconds'
  },
  
  QUALITY_PRIORITY: {
    model: 'gpt-4o',
    reason: 'Highest quality, slower processing',
    estimatedTime: '20-40 seconds'
  }
} as const;
