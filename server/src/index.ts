import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase, closeDatabase, saveDatabase } from './db/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import taskRoutes from './routes/task.routes.js';
import aiRoutes from './routes/ai.routes.js';
import weatherRoutes from './routes/weather.routes.js';
import shipRoutes from './routes/ship.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import attachmentRoutes from './routes/attachment.routes.js';
import configRoutes from './routes/config.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
import equipmentRoutes from './routes/equipment.routes.js';
import supplierRoutes from './routes/supplier.routes.js';
import budgetRoutes from './routes/budget.routes.js';
import waterLevelRoutes from './routes/water-level.routes.js';
import engineHoursRoutes from './routes/engine-hours.routes.js';
import tanksRoutes from './routes/tanks.routes.js';
import apiKeysRoutes from './routes/api-keys.routes.js';
import type { Server } from 'http';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// --- Middleware ---
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.CORS_ORIGIN
        : true, // Allow any origin in dev (Vite + mobile app on LAN)
    credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Health check ---
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/ships', shipRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/attachments', attachmentRoutes);
app.use('/api/config', configRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/water-level', waterLevelRoutes);
app.use('/api/engine-hours', engineHoursRoutes);
app.use('/api/tanks', tanksRoutes);
app.use('/api/api-keys', apiKeysRoutes);
// app.use('/api/reports', reportRoutes);

// --- Error handler (must be last) ---
app.use(errorHandler);

// --- Auto-save database periodically ---
let saveInterval: ReturnType<typeof setInterval> | null = null;
let server: Server | null = null;

// --- Server startup ---
export async function start(): Promise<void> {
    try {
        await initDatabase();
        console.log('✅ Baza danych zainicjalizowana');

        // Auto-save co 30 sekund
        saveInterval = setInterval(() => {
            try {
                saveDatabase();
            } catch {
                console.error('❌ Błąd zapisu bazy danych');
            }
        }, 30_000);

        server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚢 Tramwaje Wodne API — port ${PORT}`);
            console.log(`   Środowisko: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   LAN: http://0.0.0.0:${PORT}/api/health`);
            console.log(`   📱 Telefon: użyj IP tego komputera w sieci WiFi`);
        });
    } catch (error) {
        console.error('❌ Błąd startu serwera:', error);
        process.exit(1);
    }
}

// --- Graceful shutdown ---
function shutdown(): void {
    console.log('\n🛑 Zamykanie serwera...');
    if (saveInterval) clearInterval(saveInterval);

    // Close HTTP server first (stop accepting new connections)
    if (server) {
        server.close(() => {
            console.log('✅ HTTP serwer zamknięty');
            closeDatabase();
            console.log('✅ Baza danych zamknięta');
            process.exit(0);
        });

        // Force exit after 5s if connections hang
        setTimeout(() => {
            console.error('⚠️ Wymuszenie zamknięcia po 5s timeout');
            closeDatabase();
            process.exit(1);
        }, 5_000);
    } else {
        closeDatabase();
        process.exit(0);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Export for testing
export { app };

// Only start server when run directly (not when imported for tests)
// Matches both: tsx src/index.ts (dev) and node dist/index.js (prod)
const entryFile = process.argv[1] ?? '';
const isMainModule =
    entryFile.replace(/\\/g, '/').endsWith('src/index.ts') ||
    entryFile.replace(/\\/g, '/').endsWith('dist/index.js');
if (isMainModule) {
    start();
}
