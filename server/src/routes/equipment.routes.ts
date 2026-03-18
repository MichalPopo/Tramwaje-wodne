import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listEquipment,
    getEquipment,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    listInstructions,
    getInstruction,
    createInstruction,
    deleteInstruction,
} from '../services/equipment.service.js';
import QRCode from 'qrcode';

const router = Router();
router.use(authMiddleware);

// ========================
// EQUIPMENT
// ========================

/** GET /api/equipment */
router.get('/', (req, res) => {
    const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
    const type = req.query.type as string | undefined;
    const equipment = listEquipment({ ship_id, type });
    res.json({ equipment });
});

/** GET /api/equipment/qr/:id — generate QR code SVG */
router.get('/qr/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const eq = getEquipment(id);
    if (!eq) { res.status(404).json({ error: 'Urządzenie nie znalezione' }); return; }

    try {
        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const url = `${appUrl}/equipment/${id}`;
        const svg = await QRCode.toString(url, { type: 'svg', width: 256, margin: 1 });
        const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
        res.json({ qr_svg: svg, qr_data_url: dataUrl, url, equipment_name: eq.name });
    } catch {
        res.status(500).json({ error: 'Błąd generowania QR' });
    }
});

/** GET /api/equipment/:id */
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const eq = getEquipment(id);
    if (!eq) { res.status(404).json({ error: 'Urządzenie nie znalezione' }); return; }
    // Include related instructions
    const instructions = listInstructions({ equipment_id: id });
    res.json({ equipment: eq, instructions });
});

/** POST /api/equipment (admin) */
router.post('/', roleGuard('admin'), (req, res) => {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'Nazwa urządzenia wymagana' }); return; }
    const eq = createEquipment(req.body);
    res.status(201).json({ equipment: eq });
});

/** PUT /api/equipment/:id (admin) */
router.put('/:id', roleGuard('admin'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const eq = updateEquipment(id, req.body);
    if (!eq) { res.status(404).json({ error: 'Urządzenie nie znalezione' }); return; }
    res.json({ equipment: eq });
});

/** DELETE /api/equipment/:id (admin) */
router.delete('/:id', roleGuard('admin'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const deleted = deleteEquipment(id);
    if (!deleted) { res.status(404).json({ error: 'Urządzenie nie znalezione' }); return; }
    res.json({ deleted: true });
});

// ========================
// INSTRUCTIONS
// ========================

/** GET /api/equipment/instructions */
router.get('/instructions/list', (req, res) => {
    const equipment_id = req.query.equipment_id ? parseInt(req.query.equipment_id as string, 10) : undefined;
    const instructions = listInstructions({ equipment_id });
    res.json({ instructions });
});

/** GET /api/equipment/instructions/:id */
router.get('/instructions/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const instruction = getInstruction(id);
    if (!instruction) { res.status(404).json({ error: 'Instrukcja nie znaleziona' }); return; }
    res.json({ instruction });
});

/** POST /api/equipment/instructions (admin) */
router.post('/instructions', roleGuard('admin'), (req, res) => {
    const { title, steps } = req.body;
    if (!title || !steps || !Array.isArray(steps) || steps.length === 0) {
        res.status(400).json({ error: 'Tytuł i co najmniej 1 krok wymagane' });
        return;
    }
    const instruction = createInstruction({
        ...req.body,
        created_by: req.user!.id,
    });
    res.status(201).json({ instruction });
});

/** POST /api/equipment/instructions/ai-format — AI formats raw text into steps */
router.post('/instructions/ai-format', roleGuard('admin'), async (req, res) => {
    const { text, equipment_name } = req.body;
    if (!text) { res.status(400).json({ error: 'Tekst wymagany' }); return; }

    try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) { res.status(500).json({ error: 'GEMINI_API_KEY nie skonfigurowany' }); return; }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        const prompt = `Jesteś ekspertem od dokumentacji technicznej statków. Sformatuj poniższy opis jako instrukcję obsługi krok-po-kroku.

${equipment_name ? `Urządzenie: ${equipment_name}\n` : ''}
Tekst do sformatowania:
"${text}"

Odpowiedz w formacie JSON (bez markdown):
{
  "title": "tytuł instrukcji",
  "description": "krótki opis co ta instrukcja robi",
  "steps": [
    {"text": "Krok 1: opis czynności"},
    {"text": "Krok 2: opis czynności"}
  ]
}

Użyj jasnego, prostego języka. Każdy krok powinien być jedną czynnością. Dodaj ostrzeżenia bezpieczeństwa gdzie to konieczne (np. "⚠️ Upewnij się, że silnik jest wyłączony").`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
            res.json({ formatted: parsed });
        } catch {
            res.json({ formatted: null, raw: responseText, error: 'Nie udało się sparsować odpowiedzi AI' });
        }
    } catch (err: any) {
        console.error('[AI Format]', err?.message);
        res.status(500).json({ error: `Błąd AI: ${err?.message || 'nieznany'}` });
    }
});

/** DELETE /api/equipment/instructions/:id (admin) */
router.delete('/instructions/:id', roleGuard('admin'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const deleted = deleteInstruction(id);
    if (!deleted) { res.status(404).json({ error: 'Instrukcja nie znaleziona' }); return; }
    res.json({ deleted: true });
});

export default router;
