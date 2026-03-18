import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { attachmentApi, type AttachmentInfo } from '../api';
import './PhotoGallery.css';

const TAG_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
    before: { label: 'Przed', color: '#f59e0b', icon: '📷' },
    after: { label: 'Po', color: '#22c55e', icon: '✅' },
    progress: { label: 'W trakcie', color: '#3b82f6', icon: '🔄' },
};

interface Props {
    taskId: number;
    attachments: AttachmentInfo[];
    onUpload?: (tag?: string) => void;
    onDelete?: (id: number) => void;
    onTagChange?: (id: number, tag: string | null) => void;
    uploading?: boolean;
    readOnly?: boolean;
}

export default function PhotoGallery({ attachments, onUpload, onDelete, onTagChange, uploading, readOnly }: Props) {
    const { token } = useAuth();
    const [viewMode, setViewMode] = useState<'grid' | 'timeline' | 'compare'>('grid');
    const [lightbox, setLightbox] = useState<{ id: number; dataUrl: string } | null>(null);
    const [loadingImg, setLoadingImg] = useState(false);

    // Grouped photos
    const photos = attachments.filter(a => a.type === 'photo');
    const before = photos.filter(a => a.tag === 'before');
    const after = photos.filter(a => a.tag === 'after');
    const progress = photos.filter(a => a.tag === 'progress');
    const untagged = photos.filter(a => !a.tag);

    const openLightbox = async (id: number) => {
        if (!token) return;
        setLoadingImg(true);
        try {
            const res = await attachmentApi.get(token, id);
            const mime = res.attachment.mime_type || 'image/jpeg';
            setLightbox({ id, dataUrl: `data:${mime};base64,${res.attachment.data_base64}` });
        } catch (e) {
            console.error(e);
        }
        setLoadingImg(false);
    };

    const closeLightbox = () => setLightbox(null);

    const renderPhotoCard = (att: AttachmentInfo, showTag = true) => {
        const tag = att.tag ? TAG_CONFIG[att.tag] : null;
        return (
            <div key={att.id} className="pg-card" onClick={() => openLightbox(att.id)}>
                <div className="pg-card-preview">
                    <span className="pg-card-icon">🖼️</span>
                    {showTag && tag && (
                        <span className="pg-tag" style={{ background: tag.color }}>
                            {tag.icon} {tag.label}
                        </span>
                    )}
                </div>
                <div className="pg-card-info">
                    <span className="pg-card-name">{att.original_name || 'Zdjęcie'}</span>
                    <span className="pg-card-meta">
                        {att.uploader_name} • {new Date(att.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
                {!readOnly && (
                    <div className="pg-card-actions" onClick={e => e.stopPropagation()}>
                        {onTagChange && (
                            <select
                                className="pg-tag-select"
                                value={att.tag || ''}
                                onChange={e => onTagChange(att.id, e.target.value || null)}
                            >
                                <option value="">Bez tagu</option>
                                <option value="before">📷 Przed</option>
                                <option value="progress">🔄 W trakcie</option>
                                <option value="after">✅ Po</option>
                            </select>
                        )}
                        {onDelete && (
                            <button className="pg-del-btn" onClick={() => onDelete(att.id)} title="Usuń">🗑️</button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="pg-container">
            {/* Toolbar */}
            <div className="pg-toolbar">
                <div className="pg-view-toggle">
                    <button className={`pg-vbtn ${viewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => setViewMode('grid')}>📱 Siatka</button>
                    <button className={`pg-vbtn ${viewMode === 'timeline' ? 'active' : ''}`}
                        onClick={() => setViewMode('timeline')}>📅 Oś czasu</button>
                    {(before.length > 0 || after.length > 0) && (
                        <button className={`pg-vbtn ${viewMode === 'compare' ? 'active' : ''}`}
                            onClick={() => setViewMode('compare')}>🔀 Porównaj</button>
                    )}
                </div>
                {!readOnly && onUpload && (
                    <div className="pg-upload-btns">
                        <button className="btn btn-ghost btn-sm" onClick={() => onUpload('before')} disabled={uploading}>
                            📷 Przed
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => onUpload()} disabled={uploading}>
                            {uploading ? '⏳...' : '📸 Dodaj'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => onUpload('after')} disabled={uploading}>
                            ✅ Po
                        </button>
                    </div>
                )}
            </div>

            {/* Views */}
            {photos.length === 0 ? (
                <div className="pg-empty">
                    <p>📷 Brak zdjęć. Dodaj pierwsze zdjęcie dokumentujące prace.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="pg-grid">
                    {photos.map(att => renderPhotoCard(att))}
                </div>
            ) : viewMode === 'timeline' ? (
                <div className="pg-timeline">
                    {photos.map((att, i) => {
                        const tag = att.tag ? TAG_CONFIG[att.tag] : null;
                        const date = new Date(att.created_at);
                        const prevDate = i > 0 ? new Date(photos[i - 1].created_at) : null;
                        const showDateHeader = !prevDate || date.toDateString() !== prevDate.toDateString();

                        return (
                            <div key={att.id}>
                                {showDateHeader && (
                                    <div className="pg-tl-date">
                                        {date.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </div>
                                )}
                                <div className="pg-tl-item" onClick={() => openLightbox(att.id)}>
                                    <div className="pg-tl-dot" style={{ background: tag?.color || 'var(--text-muted)' }} />
                                    <div className="pg-tl-content">
                                        <div className="pg-tl-header">
                                            {tag && <span className="pg-tag pg-tag-sm" style={{ background: tag.color }}>{tag.icon} {tag.label}</span>}
                                            <span className="pg-tl-time">
                                                {date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <span className="pg-tl-name">{att.original_name || 'Zdjęcie'}</span>
                                        <span className="pg-tl-meta">{att.uploader_name}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Compare (before/after) */
                <div className="pg-compare">
                    <div className="pg-compare-col">
                        <h4 className="pg-compare-title" style={{ color: TAG_CONFIG.before.color }}>
                            📷 Przed ({before.length})
                        </h4>
                        {before.length === 0
                            ? <div className="pg-compare-empty">Brak zdjęć "Przed"</div>
                            : before.map(att => renderPhotoCard(att, false))}
                    </div>
                    <div className="pg-compare-divider" />
                    <div className="pg-compare-col">
                        <h4 className="pg-compare-title" style={{ color: TAG_CONFIG.after.color }}>
                            ✅ Po ({after.length})
                        </h4>
                        {after.length === 0
                            ? <div className="pg-compare-empty">Brak zdjęć "Po"</div>
                            : after.map(att => renderPhotoCard(att, false))}
                    </div>
                </div>
            )}

            {/* Summary */}
            {photos.length > 0 && (
                <div className="pg-summary">
                    {before.length > 0 && <span className="pg-summary-tag" style={{ color: TAG_CONFIG.before.color }}>📷 Przed: {before.length}</span>}
                    {progress.length > 0 && <span className="pg-summary-tag" style={{ color: TAG_CONFIG.progress.color }}>🔄 W trakcie: {progress.length}</span>}
                    {after.length > 0 && <span className="pg-summary-tag" style={{ color: TAG_CONFIG.after.color }}>✅ Po: {after.length}</span>}
                    {untagged.length > 0 && <span className="pg-summary-tag">📎 Bez tagu: {untagged.length}</span>}
                </div>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div className="pg-lightbox" onClick={closeLightbox}>
                    <div className="pg-lightbox-inner" onClick={e => e.stopPropagation()}>
                        <button className="pg-lightbox-close" onClick={closeLightbox}>✕</button>
                        <img src={lightbox.dataUrl} alt="Podgląd" className="pg-lightbox-img" />
                    </div>
                </div>
            )}

            {loadingImg && (
                <div className="pg-lightbox">
                    <div className="spinner" style={{ width: 40, height: 40 }} />
                </div>
            )}
        </div>
    );
}
