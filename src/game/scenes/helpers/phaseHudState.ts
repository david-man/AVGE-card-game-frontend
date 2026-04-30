type PhaseHudStateScene = any;

const resolveTurnDisplayName = (scene: PhaseHudStateScene): string => {
    const isPlayerView = scene.activeViewMode === 'p1' || scene.activeViewMode === 'p2';
    const isCurrentTurnView = isPlayerView && scene.activeViewMode === scene.playerTurn;
    return isCurrentTurnView ? 'YOURS' : scene.getPlayerUsername(scene.playerTurn);
};

export const refreshPlayerStatsHud = (scene: PhaseHudStateScene): void => {
    scene.playerStatsHudController.refresh(
        scene.activeViewMode,
        scene.playerTurnAttributesByPlayer,
        {
            p1: scene.getPlayerUsername('p1'),
            p2: scene.getPlayerUsername('p2'),
        }
    );
};

export const refreshPhaseHud = (scene: PhaseHudStateScene): void => {
    const displayedPhase = scene.isPregameInitActive()
        ? 'init'
        : scene.gamePhase;
    const turnDisplayName = resolveTurnDisplayName(scene);
    scene.phaseHudController.refresh(scene.activeViewMode, displayedPhase, turnDisplayName, scene.roundNumber);
    scene.refreshPhaseStateActionButton();
};