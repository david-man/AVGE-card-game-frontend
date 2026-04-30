import { CardHolder, EnergyHolder, PlayerId } from '../../entities';
import {
    ENTITY_VISUALS,
    GAME_CENTER_Y,
    UI_SCALE,
} from '../../config';
import { fitTextToTwoLines } from '../../ui/overlays/textFit';

type ViewMode = PlayerId | 'spectator';
type BoardProjectionScene = any;

export const transformBoardPositionForView = (x: number, y: number, mirrorTopBottom: boolean): { x: number; y: number } => {
    if (!mirrorTopBottom) {
        return { x, y };
    }

    // Mirror only top/bottom so left/right semantics stay stable for both players.
    return {
        x,
        y: ((GAME_CENTER_Y * 2) - y),
    };
};

export const isZoneVisibleInSpectator = (zoneId: string): boolean => {
    return zoneId === 'stadium'
        || zoneId === 'p1-bench'
        || zoneId === 'p1-active'
        || zoneId === 'p2-bench'
        || zoneId === 'p2-active';
};

export const applyBoardView = (scene: BoardProjectionScene, viewMode: ViewMode): void => {
    scene.activeViewMode = viewMode;
    scene.surrenderController.disarm(false);
    const mirrorTopBottom = viewMode === 'p2';

    for (const holder of scene.cardHolders) {
        const basePosition = scene.baseCardHolderPositionById[holder.id];
        if (!basePosition) {
            continue;
        }

        const { x, y } = transformBoardPositionForView(basePosition.x, basePosition.y, mirrorTopBottom);
        holder.setPosition(x, y);
    }

    for (const holder of scene.energyHolders) {
        const basePosition = scene.baseEnergyHolderPositionById[holder.id];
        if (!basePosition) {
            continue;
        }

        const { x, y } = transformBoardPositionForView(basePosition.x, basePosition.y, mirrorTopBottom);
        holder.setPosition(x, y);
    }

    scene.layoutAllHolders();
    scene.redrawAllCardMarks();
    updateZoneLabelsForView(scene);
    applyZoneVisibilityByView(scene);
    scene.refreshSurrenderButton();
    scene.refreshPlayerStatsHud();
    scene.refreshPhaseHud();
};

export const getViewModeLabel = (scene: BoardProjectionScene, viewMode: ViewMode): string => {
    if (viewMode === 'spectator') {
        return 'SPECTATOR';
    }

    return scene.getPlayerUsername(viewMode);
};

export const applyZoneVisibilityByView = (scene: BoardProjectionScene): void => {
    const spectatorView = scene.activeViewMode === 'spectator';

    for (const holder of scene.cardHolders) {
        const visible = spectatorView ? isZoneVisibleInSpectator(holder.id) : true;
        holder.background.setVisible(visible);
        holder.labelText.setVisible(visible);
    }

    for (const holder of scene.energyHolders) {
        const visible = spectatorView ? isZoneVisibleInSpectator(holder.id) : true;
        holder.background.setVisible(visible);
        holder.labelText.setVisible(visible);
        if (!visible) {
            holder.hidePileCountDisplays();
        }
    }

    for (const token of scene.energyTokens) {
        const visible = spectatorView ? isZoneVisibleInSpectator(token.getZoneId()) : true;
        token.body.setVisible(visible);
    }
};

export const applyCardVisibilityByView = (scene: BoardProjectionScene): void => {
    for (const card of scene.cards) {
        const zoneId = card.getZoneId();
        const cardOwner = card.getOwnerId();
        const zoneVisible = scene.isZoneVisibleToView(zoneId, cardOwner);

        if (scene.activeViewMode === 'spectator') {
            card.setVisibility(zoneVisible);
            continue;
        }

        card.setVisibility(true);
        card.setTurnedOver(!zoneVisible);
    }
};

export const updateZoneLabelsForView = (scene: BoardProjectionScene): void => {
    const parseOwnedZone = (zoneId: string): { ownerId: PlayerId; pileName: string } | null => {
        const match = /^(p1|p2)-([a-z]+)$/.exec(zoneId);
        if (!match) {
            return null;
        }
        const ownerId = match[1] as PlayerId;
        const pileName = match[2];
        return { ownerId, pileName };
    };

    const resolvePerspectiveLabel = (ownerId: PlayerId, pileName: string): string => {
        if (scene.activeViewMode === 'spectator') {
            return `${ownerId} ${pileName}`.toUpperCase();
        }

        const perspective = ownerId === scene.activeViewMode ? 'your' : 'opponent';
        return `${perspective} ${pileName}`.toUpperCase();
    };

    const setCardHolderLabel = (holder: CardHolder, label: string): void => {
        const preferredSize = Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(ENTITY_VISUALS.cardHolderLabelBaseSize * UI_SCALE));
        const fitted = fitTextToTwoLines({
            scene,
            text: label,
            preferredSize,
            minSize: Math.max(ENTITY_VISUALS.cardHolderLabelMinSize, Math.round(preferredSize * 0.72)),
            maxWidth: Math.max(10, Math.round(holder.width * 0.9))
        });
        holder.labelText
            .setAlign('center')
            .setText(fitted.text)
            .setFontSize(fitted.fontSize);
    };

    const setEnergyHolderLabel = (holder: EnergyHolder, label: string): void => {
        const preferredSize = Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(ENTITY_VISUALS.energyHolderLabelBaseSize * UI_SCALE));
        const fitted = fitTextToTwoLines({
            scene,
            text: label,
            preferredSize,
            minSize: Math.max(ENTITY_VISUALS.energyHolderLabelMinSize, Math.round(preferredSize * 0.72)),
            maxWidth: Math.max(10, Math.round(holder.width * 0.9))
        });
        holder.labelText
            .setAlign('center')
            .setText(fitted.text)
            .setFontSize(fitted.fontSize);
    };

    for (const holder of scene.cardHolders) {
        if (holder.id === 'stadium') {
            setCardHolderLabel(holder, 'STADIUM');
            continue;
        }

        const ownedZone = parseOwnedZone(holder.id);
        if (!ownedZone) {
            setCardHolderLabel(holder, holder.id.replace(/-/g, ' ').toUpperCase());
            continue;
        }

        setCardHolderLabel(holder, resolvePerspectiveLabel(ownedZone.ownerId, ownedZone.pileName));
    }

    for (const holder of scene.energyHolders) {
        if (holder.id === 'energy-discard') {
            setEnergyHolderLabel(holder, 'ENERGY DISCARD');
            continue;
        }

        const ownedZone = parseOwnedZone(holder.id);
        if (!ownedZone) {
            setEnergyHolderLabel(holder, holder.id.replace(/-/g, ' ').toUpperCase());
            continue;
        }

        setEnergyHolderLabel(holder, resolvePerspectiveLabel(ownedZone.ownerId, ownedZone.pileName));
    }
};