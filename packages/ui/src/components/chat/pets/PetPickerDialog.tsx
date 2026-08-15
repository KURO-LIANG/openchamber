/**
 * The `/pets` picker, mirroring the Codex pet picker: a list of the built-in
 * pets plus a "Disabled" entry, with a preview pane beside it. The preview
 * follows the selected entry through the Codex states — loading, disabled,
 * error, or a static idle frame once the spritesheet is cached.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { FRAME_HEIGHT, FRAME_WIDTH } from './animations';
import { BUILTIN_PETS, builtinPet } from './catalog';
import { ensurePetAsset, getPetAssetImage, getPetAssetStatus, subscribePetAssets, type PetAssetStatus } from './petAssetStore';
import { changePetPreference, usePetPreference } from './petPreference';

const PET_DESCRIPTION_KEY: Record<string, I18nKey> = {
    codex: 'chat.pets.description.codex',
    dewey: 'chat.pets.description.dewey',
    fireball: 'chat.pets.description.fireball',
    rocky: 'chat.pets.description.rocky',
    seedy: 'chat.pets.description.seedy',
    stacky: 'chat.pets.description.stacky',
    bsod: 'chat.pets.description.bsod',
    'null-signal': 'chat.pets.description.nullSignal',
};

/** The "Disabled" entry id, matching the Codex DISABLED_PET_ID semantics. */
const DISABLED_PET_ENTRY = 'disabled';

interface PetPickerDialogProps {
    open: boolean;
    onClose: () => void;
}

export const PetPickerDialog: React.FC<PetPickerDialogProps> = ({ open, onClose }) => {
    const { t } = useI18n();
    const showPet = useUIStore((state) => state.showPet);
    const setShowPet = useUIStore((state) => state.setShowPet);
    const petSize = useUIStore((state) => state.petSize);
    const petId = usePetPreference();
    const [selected, setSelected] = React.useState<string | null>(showPet ? petId : DISABLED_PET_ENTRY);

    const previewHeight = Math.round(96 * petSize);
    const previewWidth = Math.round(previewHeight * FRAME_WIDTH / FRAME_HEIGHT);

    React.useEffect(() => {
        if (open) {
            setSelected(showPet ? petId : DISABLED_PET_ENTRY);
        }
    }, [open, showPet, petId]);

    const previewPet = selected === DISABLED_PET_ENTRY ? null : builtinPet(selected ?? '');
    const [assetStatus, setAssetStatus] = React.useState<PetAssetStatus>(() =>
        previewPet ? getPetAssetStatus(previewPet.id) : 'idle',
    );
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        setAssetStatus(previewPet ? getPetAssetStatus(previewPet.id) : 'idle');
        if (!previewPet) return;
        const unsubscribe = subscribePetAssets(() =>
            setAssetStatus(getPetAssetStatus(previewPet.id)),
        );
        void ensurePetAsset(previewPet, true);
        return unsubscribe;
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    // Static idle frame (sprite index 0) once the spritesheet is ready.
    React.useEffect(() => {
        if (!previewPet || assetStatus !== 'ok') return;
        const canvas = canvasRef.current;
        const image = getPetAssetImage(previewPet.id);
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        ctx.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    }, [previewPet, assetStatus]);

    const handleApply = () => {
        if (selected === DISABLED_PET_ENTRY) {
            setShowPet(false);
        } else if (selected) {
            changePetPreference(selected);
            setShowPet(true);
        }
        onClose();
    };

    const currentSelection = showPet ? petId : DISABLED_PET_ENTRY;

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('chat.pets.picker.title')}</DialogTitle>
                </DialogHeader>

                <div className="flex min-h-0 gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
                        <button
                            type="button"
                            onClick={() => setSelected(DISABLED_PET_ENTRY)}
                            className={cn(
                                'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left',
                                selected === DISABLED_PET_ENTRY && 'bg-interactive-selection',
                            )}
                        >
                            <span className="text-sm font-medium text-foreground">
                                {t('chat.pets.picker.disabledItem')}
                            </span>
                            {currentSelection === DISABLED_PET_ENTRY && (
                                <Icon name="check" className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            )}
                        </button>

                        {BUILTIN_PETS.map((pet) => (
                            <button
                                key={pet.id}
                                type="button"
                                onClick={() => setSelected(pet.id)}
                                className={cn(
                                    'flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-interactive-hover',
                                    selected === pet.id && 'bg-interactive-selection',
                                )}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">{pet.displayName}</span>
                                    {currentSelection === pet.id && (
                                        <Icon name="check" className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                                    )}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {t(PET_DESCRIPTION_KEY[pet.id])}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="flex w-44 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-border/60 p-3">
                        {selected === DISABLED_PET_ENTRY ? (
                            <>
                                <p className="text-center text-sm font-medium text-foreground">
                                    {t('chat.pets.picker.disabledTitle')}
                                </p>
                                <p className="text-center text-xs text-muted-foreground">
                                    {t('chat.pets.picker.disabledBody')}
                                </p>
                            </>
                        ) : assetStatus === 'ok' ? (
                            <canvas
                                ref={canvasRef}
                                width={FRAME_WIDTH}
                                height={FRAME_HEIGHT}
                                style={{ height: previewHeight, width: previewWidth }}
                                aria-hidden="true"
                            />
                        ) : assetStatus === 'failed' ? (
                            <p className="text-center text-sm font-medium text-foreground">
                                {t('chat.pets.picker.previewError')}
                            </p>
                        ) : (
                            <p className="text-center text-xs text-muted-foreground">
                                {t('chat.pets.picker.loadingPreview')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button size="sm" onClick={handleApply}>
                        {t('chat.pets.picker.select')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
