import React from 'react';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { FRAME_HEIGHT, FRAME_WIDTH } from './animations';
import type { PetCatalogEntry } from './catalog';
import { loadCustomPetSprite, type CustomPetCatalogEntry } from './customPets';
import { getPetAssetImage, usePetAsset } from './petAssetStore';

interface PetPreviewProps {
    pet: PetCatalogEntry | CustomPetCatalogEntry;
    size?: number;
}

export const PetPreview: React.FC<PetPreviewProps> = ({ pet, size = 48 }) => {
    const runtimeApis = useRuntimeAPIs();
    const loadSprite = React.useMemo(() => {
        if ('isCustom' in pet && runtimeApis?.files?.readFileBinary) {
            return () => loadCustomPetSprite(runtimeApis.files, pet as CustomPetCatalogEntry);
        }
        return undefined;
    }, [pet, runtimeApis]);
    const assetStatus = usePetAsset(pet, loadSprite);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        if (assetStatus !== 'ok') return;
        const canvas = canvasRef.current;
        const image = getPetAssetImage(pet.id);
        if (!canvas || !image) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        ctx.drawImage(image, 0, 0, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    }, [assetStatus, pet.id]);

    if (assetStatus !== 'ok') {
        return (
            <div
                className="shrink-0 rounded-md bg-[var(--surface-muted)]"
                style={{ width: size, height: size }}
            />
        );
    }

    return (
        <canvas
            ref={canvasRef}
            width={FRAME_WIDTH}
            height={FRAME_HEIGHT}
            className="shrink-0"
            style={{ width: size, height: size }}
        />
    );
};
