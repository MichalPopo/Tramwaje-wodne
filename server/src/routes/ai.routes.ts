import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { aiChatSchema } from '../services/validation.js';
import {
    sendMessage,
    getConversations,
    getConversationMessages,
    deleteConversation,
    searchSupplier,
    generateTaskMaterials,
} from '../services/ai.service.js';

const router = Router();

// All AI routes require authentication
router.use(authMiddleware);

// Rate limit: 30 messages per 10 minutes per IP
const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    message: { error: 'Zbyt wiele zapytań do AI. Spróbuj za kilka minut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * POST /api/ai/chat
 * Send a message to AI assistant
 */
router.post('/chat', aiLimiter, async (req, res) => {
    try {
        const { message, conversation_id } = aiChatSchema.parse(req.body);
        const user = req.user!;

        const result = await sendMessage(
            user.id,
            user.name,
            user.role,
            message,
            conversation_id ?? undefined,
        );

        res.json(result);
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }

        if (error instanceof Error) {
            if (error.message === 'CONVERSATION_NOT_FOUND') {
                res.status(404).json({ error: 'Konwersacja nie znaleziona' });
                return;
            }
            if (error.message === 'GEMINI_API_KEY is not configured') {
                res.status(503).json({ error: 'AI jest niedostępne — brak klucza API' });
                return;
            }
        }

        // Gemini API rate limit or other HTTP errors
        const errObj = error as { status?: number; statusText?: string };
        if (errObj.status === 429) {
            res.status(429).json({ error: 'Zbyt wiele zapytań do AI. Spróbuj za minutę.' });
            return;
        }

        console.error('[AI] Error:', error);
        res.status(500).json({ error: 'Błąd komunikacji z AI' });
    }
});

/**
 * GET /api/ai/conversations
 * List user's conversations
 */
router.get('/conversations', (req, res) => {
    const conversations = getConversations(req.user!.id);
    res.json({ conversations });
});

/**
 * GET /api/ai/conversations/:id
 * Get conversation messages
 */
router.get('/conversations/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id) || id <= 0) {
            res.status(400).json({ error: 'Nieprawidłowe ID konwersacji' });
            return;
        }

        const messages = getConversationMessages(id, req.user!.id);
        res.json({ messages });
    } catch (error) {
        if (error instanceof Error && error.message === 'CONVERSATION_NOT_FOUND') {
            res.status(404).json({ error: 'Konwersacja nie znaleziona' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * DELETE /api/ai/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID konwersacji' });
        return;
    }

    const deleted = deleteConversation(id, req.user!.id);
    if (!deleted) {
        res.status(404).json({ error: 'Konwersacja nie znaleziona' });
        return;
    }

    res.status(204).send();
});

/**
 * POST /api/ai/search-supplier
 * Search for a supplier using AI + Google Search grounding
 */
router.post('/search-supplier', aiLimiter, async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string' || query.trim().length < 3) {
            res.status(400).json({ error: 'Zapytanie musi mieć minimum 3 znaki' });
            return;
        }

        const result = await searchSupplier(query.trim());
        res.json(result);
    } catch (error) {
        const errObj = error as { status?: number };
        if (errObj.status === 429) {
            res.status(429).json({ error: 'Zbyt wiele zapytań. Spróbuj za minutę.' });
            return;
        }
        console.error('[AI Search] Error:', error);
        res.status(500).json({ error: 'Błąd wyszukiwania' });
    }
});

/**
 * POST /api/ai/generate-materials
 * AI generates material list for a task, cross-referenced with inventory
 */
router.post('/generate-materials', aiLimiter, async (req, res) => {
    try {
        const { title, category, ship_id, description } = req.body;
        if (!title || typeof title !== 'string' || title.trim().length < 3) {
            res.status(400).json({ error: 'Tytuł musi mieć minimum 3 znaki' });
            return;
        }

        const result = await generateTaskMaterials(
            title.trim(),
            category || 'inne',
            ship_id ? Number(ship_id) : null,
            description?.trim(),
        );
        res.json(result);
    } catch (error) {
        const errObj = error as { status?: number };
        if (errObj.status === 429) {
            res.status(429).json({ error: 'Zbyt wiele zapytań. Spróbuj za minutę.' });
            return;
        }
        console.error('[AI Materials] Error:', error);
        res.status(500).json({ error: 'Błąd generowania materiałów' });
    }
});

export default router;
