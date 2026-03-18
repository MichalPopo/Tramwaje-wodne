import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listCertificates,
    getCertificate,
    createCertificate,
    updateCertificate,
    deleteCertificate,
    getExpiringCertificates,
    listTemplates,
    createTemplate,
    deleteTemplate,
    listInspections,
    createInspection,
} from '../services/certificate.service.js';

const router = Router();
router.use(authMiddleware);

// ========================
// CERTIFICATES
// ========================

/** GET /api/certificates — list all, optional filters */
router.get('/', async (req, res) => {
    const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
    const status = req.query.status as string | undefined;
    const certs = await listCertificates({ ship_id, status });
    res.json({ certificates: certs });
});

/** GET /api/certificates/expiring — certs expiring within N days */
router.get('/expiring', async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const certs = await getExpiringCertificates(days);
    res.json({ certificates: certs });
});

/** POST /api/certificates/scan — AI scan photos to extract cert data */
router.post('/scan', roleGuard('admin'), async (req, res) => {
    try {
        const { images } = req.body; // Array of { base64: string, mimeType: string }
        if (!images || !Array.isArray(images) || images.length === 0) {
            res.status(400).json({ error: 'Wymagane co najmniej jedno zdjęcie' });
            return;
        }

        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            res.status(500).json({ error: 'GEMINI_API_KEY nie skonfigurowany' });
            return;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

        const imageParts = images.map((img: { base64: string; mimeType: string }) => ({
            inlineData: {
                data: img.base64,
                mimeType: img.mimeType || 'image/jpeg',
            },
        }));

        const prompt = `Analizujesz zdjęcia certyfikatu/świadectwa statku. Wyciągnij z nich kluczowe dane.

Odpowiedz WYŁĄCZNIE w formacie JSON (bez markdown):
{
  "name": "pełna nazwa dokumentu/certyfikatu",
  "issuer": "nazwa wydawcy (np. PRS, Urząd Morski)",
  "number": "numer dokumentu",
  "issue_date": "data wydania w formacie YYYY-MM-DD lub null",
  "expiry_date": "data ważności w formacie YYYY-MM-DD lub null",
  "notes": "dodatkowe ważne informacje z dokumentu (typ statku, ograniczenia, uwagi)"
}

Jeśli nie jesteś w stanie odczytać jakiegoś pola, ustaw null.
Jeśli na zdjęciach nie widać certyfikatu, zwróć: {"error": "Nie rozpoznano certyfikatu na zdjęciu"}`;

        const result = await model.generateContent([prompt, ...imageParts]);
        const text = result.response.text().trim();

        // Parse JSON from AI response
        let parsed;
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        } catch {
            res.json({ extracted: null, raw: text, error: 'Nie udało się sparsować odpowiedzi AI' });
            return;
        }

        if (parsed.error) {
            res.json({ extracted: null, error: parsed.error });
            return;
        }

        res.json({ extracted: parsed });
    } catch (err: any) {
        console.error('[AI Scan] Error:', err?.message || err);
        const msg = err?.message?.includes('Too Many Requests') ? 'Za dużo zapytań AI, spróbuj za chwilę'
            : err?.message?.includes('SAFETY') ? 'Treść zablokowana przez filtr bezpieczeństwa'
                : err?.message?.includes('quota') ? 'Przekroczono limit API Gemini'
                    : `Błąd analizy AI: ${err?.message || 'nieznany błąd'}`;
        res.status(500).json({ error: msg });
    }
});

/** GET /api/certificates/:id */
router.get('/:id', async (req, res, next) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { return next(); }
    const cert = await getCertificate(id);
    if (!cert) { res.status(404).json({ error: 'Certyfikat nie znaleziony' }); return; }
    res.json({ certificate: cert });
});

/** POST /api/certificates — create (admin) */
router.post('/', roleGuard('admin'), async (req, res) => {
    const { name, expiry_date } = req.body;
    if (!name || !expiry_date) {
        res.status(400).json({ error: 'Nazwa i data ważności są wymagane' });
        return;
    }
    const cert = await createCertificate(req.body);
    res.status(201).json({ certificate: cert });
});

/** PUT /api/certificates/:id — update (admin) */
router.put('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const cert = await updateCertificate(id, req.body);
    if (!cert) { res.status(404).json({ error: 'Certyfikat nie znaleziony' }); return; }
    res.json({ certificate: cert });
});

/** DELETE /api/certificates/:id — delete (admin) */
router.delete('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const deleted = await deleteCertificate(id);
    if (!deleted) { res.status(404).json({ error: 'Certyfikat nie znaleziony' }); return; }
    res.json({ deleted: true });
});

// ========================
// INSPECTION TEMPLATES
// ========================

/** GET /api/certificates/inspections/templates */
router.get('/inspections/templates', async (req, res) => {
    const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
    const templates = await listTemplates(ship_id);
    const parsed = templates.map(t => ({
        ...t,
        items: JSON.parse(t.items || '[]'),
    }));
    res.json({ templates: parsed });
});

/** POST /api/certificates/inspections/templates — create (admin) */
router.post('/inspections/templates', roleGuard('admin'), async (req, res) => {
    const { name, items } = req.body;
    if (!name || !items || !Array.isArray(items)) {
        res.status(400).json({ error: 'Nazwa i lista punktów (items) są wymagane' });
        return;
    }
    const template = await createTemplate(req.body);
    if (template) {
        res.status(201).json({
            template: { ...template, items: JSON.parse(template.items || '[]') },
        });
    } else {
        res.status(500).json({ error: 'Błąd tworzenia szablonu' });
    }
});

/** DELETE /api/certificates/inspections/templates/:id (admin) */
router.delete('/inspections/templates/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const deleted = await deleteTemplate(id);
    if (!deleted) { res.status(404).json({ error: 'Szablon nie znaleziony' }); return; }
    res.json({ deleted: true });
});

// ========================
// INSPECTIONS
// ========================

/** GET /api/certificates/inspections */
router.get('/inspections', async (req, res) => {
    const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
    const template_id = req.query.template_id ? parseInt(req.query.template_id as string, 10) : undefined;
    const inspections = await listInspections({ ship_id, template_id });
    const parsed = inspections.map(i => ({
        ...i,
        results: JSON.parse(i.results || '[]'),
    }));
    res.json({ inspections: parsed });
});

/** POST /api/certificates/inspections — execute inspection */
router.post('/inspections', async (req, res) => {
    const { template_id, results } = req.body;
    if (!template_id || !results || !Array.isArray(results)) {
        res.status(400).json({ error: 'ID szablonu i wyniki (results) są wymagane' });
        return;
    }
    const inspection = await createInspection({
        ...req.body,
        inspector_id: req.user!.id,
    });
    if (inspection) {
        res.status(201).json({
            inspection: { ...inspection, results: JSON.parse(inspection.results || '[]') },
        });
    } else {
        res.status(500).json({ error: 'Błąd zapisu inspekcji' });
    }
});

export default router;
