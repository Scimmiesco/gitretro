
export interface SpeechResponse {
    content: string;
    reasoning?: string;
}

export const generateSpeechWithAI = async (prompt: string): Promise<SpeechResponse> => {
    // Check for key in likely places
    const apiKey = (import.meta as any).env?.VITE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;

    if (!apiKey) throw new Error("API Key (VITE_DEEPSEEK_API_KEY) não configurada.");

    try {
        // Using the proxy setup in vite.config.ts -> /deepseek-api -> https://api.deepseek.com
        const response = await fetch('/deepseek-api/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'deepseek-reasoner',
                messages: [
                    { role: "user", content: prompt }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`DeepSeek API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const message = data.choices[0].message;

        return {
            content: message.content,
            reasoning: message.reasoning_content
        };

    } catch (e: any) {
        console.error("AI Request Failed:", e);
        throw new Error("Erro na IA: " + e.message);
    }
};
