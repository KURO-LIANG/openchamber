/**
 * The pet rendered inside the desktop always-on-top overlay window
 * (`pet-overlay.html`). It receives its display inputs — pet id, status
 * state, size, and the assistant-reply preview — from the main window via the
 * `pet-overlay-update` native event, because the authoritative state lives in
 * the main app's stores. Long-pressing drags the window by reporting pointer
 * deltas to the main process (`pet_overlay_move`), which moves and persists
 * the window position.
 *
 * The window is transparent and frameless, so this component owns the whole
 * page: the bubble column above the sprite, nothing else.
 */

import React from 'react';
import { useI18n } from '@/lib/i18n';
import { invokeDesktop } from '@/lib/desktop';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { cn } from '@/lib/utils';
import {
    FRAME_HEIGHT,
    FRAME_WIDTH,
    SPRITESHEET_COLUMNS,
    animationForState,
    frameIndexAtElapsed,
    type PetDisplayState,
} from './animations';
import { DEFAULT_PET_ID } from './catalog';
import { getPetAssetImage, usePetAsset } from './petAssetStore';
import {
    getCustomPetsDirectory,
    loadCustomPetSprite,
    resolvePet,
    scanCustomPets,
    type CustomPetCatalogEntry,
} from './customPets';
import { usePetDrag } from './usePetDrag';
import { PetStatusBubble } from './PetStatusBubble';

/** Codex PET_TARGET_HEIGHT_PX, scaled up; width keeps the 192:208 frame aspect. */
const DISPLAY_HEIGHT = 96;

/**
 * Vertical space reserved above the sprite for the status bubble column.
 * The main process sizes the overlay window with this same constant (see
 * main.mjs) so the bubble never gets clipped.
 */
export const PET_OVERLAY_BUBBLE_SPACE_HEIGHT = 96;

const VALID_STATES: readonly PetDisplayState[] = ['running', 'needs-input', 'ready', 'blocked'];

interface OverlayPetState {
    petId: string;
    state: PetDisplayState;
    petSize: number;
    preview: string | null;
}

function sanitizeOverlayState(payload: unknown): OverlayPetState | null {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload as Record<string, unknown>;
    const petId = typeof candidate.petId === 'string' && candidate.petId ? candidate.petId : DEFAULT_PET_ID;
    const state = VALID_STATES.includes(candidate.state as PetDisplayState)
        ? (candidate.state as PetDisplayState)
        : 'ready';
    const rawSize = typeof candidate.petSize === 'number' ? candidate.petSize : 1;
    const petSize = Math.max(0.5, Math.min(1.5, rawSize));
    const preview = typeof candidate.preview === 'string' ? candidate.preview : null;
    return { petId, state, petSize, preview };
}

function readHomeDirectory(): string {
    if (typeof window === 'undefined') return '';
    const home = (window as unknown as { __OPENCHAMBER_HOME__?: string }).__OPENCHAMBER_HOME__;
    return typeof home === 'string' ? home : '';
}

export function PetOverlay() {
    const { t } = useI18n();
    const runtimeApis = useRuntimeAPIs();
    const [display, setDisplay] = React.useState<OverlayPetState>(() => ({
        petId: DEFAULT_PET_ID,
        state: 'ready',
        petSize: 1,
        preview: null,
    }));
    const [customPets, setCustomPets] = React.useState<CustomPetCatalogEntry[]>([]);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    // The main window pushes the authoritative display state over the native
    // bridge; the initial snapshot is replayed by the main process when the
    // window is created/shown, so defaults here are only a placeholder.
    React.useEffect(() => {
        const onUpdate = (payload: unknown) => {
            const next = sanitizeOverlayState(payload);
            if (next) setDisplay(next);
        };
        const onEvent = (event: Event) => onUpdate((event as CustomEvent).detail);
        window.addEventListener('pet-overlay-update', onEvent);
        return () => window.removeEventListener('pet-overlay-update', onEvent);
    }, []);

    // Scan the user's custom pets directory; the overlay shares the main
    // window's origin so the IndexedDB sprite cache is shared as well.
    const homeDirectory = React.useMemo(readHomeDirectory, []);
    React.useEffect(() => {
        if (!homeDirectory || !runtimeApis?.files?.listDirectory) {
            setCustomPets([]);
            return;
        }
        let cancelled = false;
        scanCustomPets(runtimeApis.files, homeDirectory)
            .then((pets) => {
                if (!cancelled) setCustomPets(pets);
            })
            .catch(() => {
                if (!cancelled) setCustomPets([]);
            });
        return () => {
            cancelled = true;
        };
    }, [homeDirectory, runtimeApis?.files]);

    const pet = React.useMemo(
        () => resolvePet(display.petId, customPets),
        [display.petId, customPets],
    );
    const makeLoader = React.useCallback(
        (target: ReturnType<typeof resolvePet>) => {
            if (target && 'isCustom' in target && runtimeApis?.files?.readFileBinary) {
                return () => loadCustomPetSprite(runtimeApis.files, target as CustomPetCatalogEntry);
            }
            return undefined;
        },
        [runtimeApis],
    );
    const loadSprite = React.useMemo(() => makeLoader(pet), [makeLoader, pet]);
    const assetStatus = usePetAsset(pet, loadSprite);

    const displayHeight = Math.round(DISPLAY_HEIGHT * display.petSize);
    const displayWidth = Math.round(displayHeight * FRAME_WIDTH / FRAME_HEIGHT);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const image = React.useMemo(() => (pet ? getPetAssetImage(pet.id) : null), [assetStatus, pet]);

    React.useEffect(() => {
        if (!image) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const track = animationForState(display.state);
        let raf = 0;
        let start = performance.now();

        const draw = (now: number) => {
            const frameIndex = frameIndexAtElapsed(track, now - start);
            const sprite = track.frames[frameIndex];
            const sx = (sprite % SPRITESHEET_COLUMNS) * FRAME_WIDTH;
            const sy = Math.floor(sprite / SPRITESHEET_COLUMNS) * FRAME_HEIGHT;
            ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            ctx.drawImage(image, sx, sy, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            raf = requestAnimationFrame(draw);
        };

        const onVisibility = () => {
            cancelAnimationFrame(raf);
            if (!document.hidden) {
                start = performance.now();
                raf = requestAnimationFrame(draw);
            }
        };

        raf = requestAnimationFrame(draw);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [image, display.state]);

    // Long-press drag moves the overlay window itself through the main
    // process, which also persists the resting position.
    const drag = usePetDrag({
        onDragMove: (dx, dy) => {
            void invokeDesktop('pet_overlay_move', { dx, dy });
        },
    });

    return (
        <div
            {...drag.pointerProps}
            className={cn(
                'flex h-full w-full touch-none select-none flex-col items-end justify-end gap-1.5 overflow-visible',
                drag.isDragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
        >
            <PetStatusBubble state={display.state} preview={display.preview} petSize={display.petSize} />
            {assetStatus === 'ok' && image ? (
                <canvas
                    ref={canvasRef}
                    width={FRAME_WIDTH}
                    height={FRAME_HEIGHT}
                    style={{ height: displayHeight, width: displayWidth }}
                    aria-hidden="true"
                />
            ) : (
                <div
                    className="flex items-center justify-center"
                    style={{ height: displayHeight, width: displayWidth }}
                >
                    <span className="text-xs text-muted-foreground">
                        {assetStatus === 'failed' ? t('chat.pets.unavailable') : t('chat.pets.loading')}
                    </span>
                </div>
            )}
        </div>
    );
}

