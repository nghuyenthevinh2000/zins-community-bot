export interface ParsedAvailability {
  startTime: Date;
  endTime: Date;
  isVague: boolean;
  explanation?: string;
}

export interface NLUParseResult {
  success: boolean;
  parsed?: ParsedAvailability[];
  error?: string;
  isVague: boolean;
}

export class OpenCodeNLUService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
    this.baseUrl = process.env.OPENCODE_BASE_URL || 'https://api.opencode.ai/v1';
  }

  async parseAvailability(text: string, referenceDate: Date = new Date()): Promise<NLUParseResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'opencodelm',
          messages: [
            {
              role: 'system',
              content: `You are a natural language time parser. Extract specific date and time ranges from the user's availability text. 
              
Parse expressions like "Tuesday after 6pm", "all day Thursday", "Friday morning", "next week", etc.

Return a JSON array of time ranges with this format:
[
  {
    "startTime": "ISO 8601 datetime string",
    "endTime": "ISO 8601 datetime string",
    "explanation": "brief explanation of what was parsed"
  }
]

Rules:
- Convert relative dates (Tuesday, next week) to absolute dates based on the reference date
- If a time range is not specified, assume reasonable defaults (e.g., "morning" = 9am-12pm, "afternoon" = 12pm-6pm, "evening" = 6pm-10pm)
- "All day" means 9am to 6pm
- If the text is too vague to extract specific times, set "isVague": true and provide an empty array
- Always return valid JSON, no markdown formatting

Reference date: ${referenceDate.toISOString()}`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`OpenCode API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return {
          success: false,
          error: 'No content in OpenCode response',
          isVague: true
        };
      }

      // Try to parse the JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // If it's not valid JSON, try to extract JSON from the text
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse OpenCode response as JSON');
        }
      }

      // Check if vague
      if (parsed.isVague || (Array.isArray(parsed) && parsed.length === 0)) {
        return {
          success: true,
          parsed: [],
          isVague: true
        };
      }

      // Convert to ParsedAvailability array
      const availabilities: ParsedAvailability[] = Array.isArray(parsed) 
        ? parsed.map((item: any) => ({
            startTime: new Date(item.startTime),
            endTime: new Date(item.endTime),
            isVague: false,
            explanation: item.explanation || ''
          }))
        : [];

      return {
        success: true,
        parsed: availabilities,
        isVague: availabilities.length === 0
      };

    } catch (error) {
      console.error('Error parsing availability:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        isVague: true
      };
    }
  }

  // Simple fallback parser for testing/development without API
  async parseAvailabilityFallback(text: string, referenceDate: Date = new Date()): Promise<NLUParseResult> {
    const lowerText = text.toLowerCase();
    const availabilities: ParsedAvailability[] = [];
    
    // Simple regex-based parsing for common patterns
    
    // Pattern: "Tuesday after 6pm", "Wednesday evening", "Thursday morning"
    const dayPattern = /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi;
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
    
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayMatches = [...text.matchAll(dayPattern)];
    
    if (dayMatches.length > 0) {
      for (const match of dayMatches) {
        const dayName = match[1].toLowerCase();
        const targetDay = days.indexOf(dayName);
        
        if (targetDay !== -1) {
          const currentDay = referenceDate.getDay();
          let daysUntil = targetDay - currentDay;
          if (daysUntil < 0) daysUntil += 7;
          
          const targetDate = new Date(referenceDate);
          targetDate.setDate(referenceDate.getDate() + daysUntil);
          
          // Default times
          let startHour = 9;
          let endHour = 18;
          
          // Check for time qualifiers
          const textAfterDay = text.substring(match.index! + match[0].length).toLowerCase();
          
          if (textAfterDay.includes('morning')) {
            startHour = 9;
            endHour = 12;
          } else if (textAfterDay.includes('afternoon')) {
            startHour = 12;
            endHour = 18;
          } else if (textAfterDay.includes('evening') || textAfterDay.includes('after')) {
            startHour = 18;
            endHour = 22;
          } else if (textAfterDay.includes('all day')) {
            startHour = 9;
            endHour = 18;
          }
          
          const startTime = new Date(targetDate);
          startTime.setHours(startHour, 0, 0, 0);
          
          const endTime = new Date(targetDate);
          endTime.setHours(endHour, 0, 0, 0);
          
          availabilities.push({
            startTime,
            endTime,
            isVague: false,
            explanation: `${dayName} ${startHour >= 12 ? 'afternoon/evening' : 'morning'}`
          });
        }
      }
    }
    
    // Check for vague responses
    const vagueTerms = ['sometime', 'whenever', 'soon', 'later', 'maybe', 'not sure'];
    const isVague = vagueTerms.some(term => lowerText.includes(term)) || availabilities.length === 0;
    
    return {
      success: true,
      parsed: availabilities,
      isVague
    };
  }
}
