/**
 * The status speech bubble shown above the pet: the localized state label
 * plus, on `ready`, a preview of the last assistant reply. Shared by the
 * in-app pet (PetBubble) and the desktop overlay window (PetOverlay).
 */

import React from 'react';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PetDisplayState } from './animations';

const STATE_TEXT_KEY: Record<PetDisplayState, I18nKey> = {
    running: 'chat.pets.state.running',
    'needs-input': 'chat.pets.state.needsInput',
    ready: 'chat.pets.state.ready',
    blocked: 'chat.pets.state.blocked',
};

interface PetStatusBubbleProps {
    state: PetDisplayState;
    /** Collapsed+truncated preview of the last assistant reply, or null. */
    preview: string | null;
    petSize: number;
    /**
     * Render the bubble with a translucent surface instead of the solid
     * popover token. Used by the desktop overlay window, where a solid
     * `--popover` (pure white in light themes) would appear as a stark
     * white block floating over the desktop. In-app bubbles keep the
     * solid popover surface.
     */
    translucent?: boolean;
}

export function PetStatusBubble({ state, preview, petSize, translucent = false }: PetStatusBubbleProps) {
    const { t } = useI18n();
    const statusFontSize = `clamp(0.75rem, 0.875rem * ${petSize}, 1.125rem)`;
    const bodyFontSize = `clamp(0.625rem, 0.75rem * ${petSize}, 1rem)`;
    const bubbleMaxWidth = `${Math.round(16 * petSize)}rem`;

    const bubbleSurface = translucent
        ? 'bg-[color-mix(in_srgb,var(--popover)_55%,transparent)] after:bg-[color-mix(in_srgb,var(--popover)_55%,transparent)]'
        : 'bg-[var(--popover)] after:bg-[var(--popover)]';

    const statusText = t(STATE_TEXT_KEY[state]);
    const body = state === 'ready' ? preview : null;
    const showStatus = state !== 'ready' && Boolean(statusText);
    const showBody = Boolean(body);

    if (!showStatus && !showBody) {
        return null;
    }

    return (
        <div className="flex flex-col items-end gap-1.5">
            {showStatus && (
                <span
                    className={cn(
                        'rounded-2xl border border-border/60 px-3 py-1.5 font-medium text-[var(--popover-foreground)] shadow-sm',
                        bubbleSurface,
                        !showBody &&
                            'relative after:absolute after:-bottom-[5px] after:right-4 after:h-2 after:w-2 after:rotate-45 after:border-b after:border-r after:border-border/60',
                    )}
                    style={{ fontSize: statusFontSize }}
                >
                    {statusText}
                </span>
            )}
            {showBody && (
                <span
                    className={cn(
                        'relative rounded-2xl border border-border/60 px-3 py-1.5 leading-relaxed text-[var(--popover-foreground)]/80 shadow-sm after:absolute after:-bottom-[5px] after:right-4 after:h-2 after:w-2 after:rotate-45 after:border-b after:border-r after:border-border/60',
                        bubbleSurface,
                    )}
                    style={{ fontSize: bodyFontSize, maxWidth: bubbleMaxWidth }}
                >
                    <span className="line-clamp-3 break-words">{body}</span>
                </span>
            )}
        </div>
    );
}
