export class GameCommandProcessor
{
    private readonly host: unknown;

    constructor (host: unknown)
    {
        this.host = host;
    }

    execute (command: string): void
    {
        const g = this.host as any;
        if (!command) {
            return;
        }

        g.appendTerminalLine(`> ${command}`);

        const commandParts = command.split(/\s+/);
        const [rawAction, rawArgOne, rawArgTwo, rawArgThree] = commandParts;
        const action = rawAction.toLowerCase();

        if (action === 'help' || action === '?') {
            this.printHelp(g);
            return;
        }

        if (action === 'rm') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: rm [energyid]');
                return;
            }

            const tokenId = Number(rawArgOne);
            if (!Number.isInteger(tokenId)) {
                g.appendTerminalLine(`Invalid energy id: ${rawArgOne}`);
                return;
            }

            const token = g.energyTokenById[tokenId];
            if (!token) {
                g.appendTerminalLine(`Unknown energy token: ${tokenId}`);
                return;
            }

            if (!g.canActOnToken(token)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ENERGY-${tokenId}`);
                return;
            }

            g.moveEnergyTokenToDiscard(token);
            g.appendTerminalLine(`ENERGY-${tokenId} -> energy-discard`);
            return;
        }

        if (action === 'game-phase' || action === 'phase') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: game-phase [no-input|phase2|atk]');
                g.appendTerminalLine('   or: phase [no-input|phase2|atk]');
                return;
            }

            const nextPhase = g.parseGamePhaseArg(rawArgOne);
            if (!nextPhase) {
                g.appendTerminalLine('Usage: game-phase [no-input|phase2|atk]');
                g.appendTerminalLine('   or: phase [no-input|phase2|atk]');
                return;
            }

            g.setGamePhase(nextPhase);
            g.appendTerminalLine(`Game phase -> ${nextPhase.toUpperCase()}`);
            return;
        }

        if (action === 'player-turn' || action === 'turn') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: player-turn [player-1|player-2]');
                g.appendTerminalLine('   or: turn [player-1|player-2]');
                return;
            }

            const nextTurn = g.parsePlayerTurnArg(rawArgOne);
            if (!nextTurn) {
                g.appendTerminalLine('Usage: player-turn [player-1|player-2]');
                g.appendTerminalLine('   or: turn [player-1|player-2]');
                return;
            }

            g.setPlayerTurn(nextTurn);
            g.appendTerminalLine(`Player turn -> ${g.getPlayerTurnLabel(nextTurn)}`);
            return;
        }

        if (action === 'stat') {
            if (!rawArgOne || !rawArgTwo || !rawArgThree) {
                g.appendTerminalLine('Usage: stat [player-1|player-2] [attribute] [value]');
                g.appendTerminalLine('Attributes: energy-add-remaining-in-turn, ko-count, supporter-uses-remaining-in-turn, swap-remaining-in-turn, attacks-left');
                return;
            }

            const targetPlayer = g.parsePlayerTurnArg(rawArgOne);
            if (!targetPlayer) {
                g.appendTerminalLine('Usage: stat [player-1|player-2] [attribute] [value]');
                return;
            }

            const attributeKey = g.parsePlayerTurnAttributeKey(rawArgTwo);
            if (!attributeKey) {
                g.appendTerminalLine(`Unknown attribute: ${rawArgTwo}`);
                g.appendTerminalLine('Attributes: energy-add-remaining-in-turn, ko-count, supporter-uses-remaining-in-turn, swap-remaining-in-turn, attacks-left');
                return;
            }

            const value = Number(rawArgThree);
            if (!Number.isFinite(value)) {
                g.appendTerminalLine(`Invalid value: ${rawArgThree}`);
                return;
            }

            g.playerTurnAttributesByPlayer[targetPlayer][attributeKey] = value;
            g.refreshPlayerStatsHud();
            g.appendTerminalLine(`${g.getPlayerTurnLabel(targetPlayer)} ${g.formatPlayerTurnAttributeLabel(attributeKey)} -> ${value}`);
            return;
        }

        if (action === 'flip') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: flip [cardid]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const card = g.cardById[cardId];

            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            if (g.activeViewMode === 'admin') {
                g.appendTerminalLine('Admin view keeps all cards face up. Use view player-1 or view player-2 to flip cards.');
                return;
            }

            const nextStateTurnedOver = !card.isTurnedOver();
            card.flip();
            g.appendTerminalLine(`${cardId} ${nextStateTurnedOver ? 'turned over' : 'face up'}`);
            return;
        }

        if (action === 'hp') {
            if (!rawArgOne || !rawArgTwo || !rawArgThree) {
                g.appendTerminalLine('Usage: hp [cardid] [hp] [maxhp]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const hp = Number(rawArgTwo);
            const maxHp = Number(rawArgThree);
            const card = g.cardById[cardId];

            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            if (card.getCardType() !== 'character') {
                g.appendTerminalLine(`hp only works on character cards: ${cardId}`);
                return;
            }

            if (!Number.isFinite(hp) || !Number.isFinite(maxHp)) {
                g.appendTerminalLine('hp and maxhp must be numbers.');
                return;
            }

            card.setHpValues(hp, maxHp);
            g.redrawAllCardMarks();
            g.appendTerminalLine(`${cardId} HP -> [${hp}/${maxHp}]`);
            return;
        }

        if (action === 'border') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: border [cardid] [hex]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const card = g.cardById[cardId];
            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            const normalizedHex = rawArgTwo.replace('#', '').replace(/^0x/i, '');
            if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) {
                g.appendTerminalLine(`Invalid hex color: ${rawArgTwo}`);
                g.appendTerminalLine('Use 6-digit hex, e.g. FF0000 or #FF0000');
                return;
            }

            const color = parseInt(normalizedHex, 16);
            card.setBorderColor(color);
            g.redrawAllCardMarks();
            g.appendTerminalLine(`${cardId} border -> #${normalizedHex.toUpperCase()}`);
            return;
        }

        if (action === 'input') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            const mode = rawArgOne.toLowerCase();
            const parsedTargetView = g.parseViewModeArg(rawArgTwo.toLowerCase());
            const targetView = parsedTargetView && parsedTargetView !== 'admin' ? parsedTargetView : null;
            const topMessage = targetView ? (rawArgThree ?? '') : rawArgTwo;
            const argsStartIndex = targetView ? 4 : 3;

            if (!topMessage) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            if (targetView && g.activeViewMode !== 'admin' && g.activeViewMode !== targetView) {
                g.clearOverlayPreviewIfActive();
                g.setBoardInputEnabled(false);
                g.appendTerminalLine(`Input OFF (target: ${g.getViewModeLabel(targetView)}, current: ${g.getViewModeLabel(g.activeViewMode)})`);
                g.emitBackendEvent('input_state_change', {
                    input_type: 'off',
                    requested_input_type: mode,
                    target_view: g.getViewModeLabel(targetView),
                    current_view: g.getViewModeLabel(g.activeViewMode),
                    message: topMessage,
                    enabled: false,
                    reason: 'view_mismatch'
                });
                return;
            }

            if (mode === 'selection') {
                const revealLatest = () => {
                    g.scrollTerminalToLatest();
                };

                const failSelection = (...lines: string[]) => {
                    lines.forEach((line) => g.appendTerminalLine(line));
                    revealLatest();
                };

                if (commandParts.length < argsStartIndex + 5) {
                    failSelection(
                        'Usage: input selection [msg] [display1,display2], [highlight1,highlight2], [num-cards], [allow-repeat] [allow-none]'
                    );
                    return;
                }

                if (g.inputOverlayController.hasActiveOverlay()) {
                    failSelection('Input overlay already active.');
                    return;
                }

                const parseBool = (value: string): boolean | null => {
                    if (value === 'true' || value === '1' || value === 'yes' || value === 'on') {
                        return true;
                    }
                    if (value === 'false' || value === '0' || value === 'no' || value === 'off') {
                        return false;
                    }
                    return null;
                };

                const cleanArg = (raw: string): string => raw.trim().replace(/^\[/, '').replace(/\]$/, '').replace(/,$/, '').trim();

                const displayListToken = cleanArg(commandParts[argsStartIndex] ?? '');
                const highlightListToken = cleanArg(commandParts[argsStartIndex + 1] ?? '');
                const numCardsToken = cleanArg(commandParts[argsStartIndex + 2] ?? '');
                const allowRepeatToken = cleanArg((commandParts[argsStartIndex + 3] ?? '').toLowerCase());
                const allowNoneToken = cleanArg((commandParts[argsStartIndex + 4] ?? '').toLowerCase());
                const allowRepeat = parseBool(allowRepeatToken);
                const allowNone = parseBool(allowNoneToken);

                if (allowRepeat === null || allowNone === null) {
                    failSelection(
                        'Invalid allow-repeat / allow-none values.',
                        'Use true/false, 1/0, yes/no, or on/off.',
                        'Usage: input selection [msg] [display1,display2], [highlight1,highlight2], [num-cards], [allow-repeat] [allow-none]'
                    );
                    return;
                }

                const numberOfSelections = Number(numCardsToken);
                if (!Number.isInteger(numberOfSelections) || numberOfSelections < 0) {
                    failSelection(`Invalid num-cards: ${numCardsToken}`);
                    return;
                }

                const displayItemsRaw = displayListToken
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0);

                if (displayItemsRaw.length === 0) {
                    failSelection('Display list cannot be empty.');
                    return;
                }

                const highlightItemsRaw = highlightListToken
                    .split(',')
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0);

                if (highlightItemsRaw.length === 0 && !allowNone && numberOfSelections > 0) {
                    failSelection('Highlight list cannot be empty when allow-none is false.');
                    return;
                }

                const toCanonicalId = (itemId: string): string => {
                    const card = g.cardById[itemId.toUpperCase()];
                    return card ? card.id : itemId;
                };

                const displayCanonicalByKey = new Map<string, { id: string; isCard: boolean; cardColor?: number; cardTypeLabel?: string }>();
                for (const itemId of displayItemsRaw) {
                    const card = g.cardById[itemId.toUpperCase()];
                    const canonicalId = card ? card.id : itemId;
                    const key = canonicalId.toLowerCase();
                    if (displayCanonicalByKey.has(key)) {
                        failSelection(`Duplicate display item: ${canonicalId}`);
                        return;
                    }
                    displayCanonicalByKey.set(key, {
                        id: canonicalId,
                        isCard: Boolean(card),
                        cardColor: card?.baseColor,
                        cardTypeLabel: card?.getCardType().toUpperCase()
                    });
                }

                const highlightKeySet = new Set<string>();
                for (const itemId of highlightItemsRaw) {
                    const canonicalId = toCanonicalId(itemId);
                    const key = canonicalId.toLowerCase();
                    if (!displayCanonicalByKey.has(key)) {
                        failSelection(`Highlight item not in display list: ${itemId}`);
                        return;
                    }
                    highlightKeySet.add(key);
                }

                const selectableCount = highlightKeySet.size + (allowNone ? 1 : 0);
                if (!allowRepeat && numberOfSelections > selectableCount) {
                    failSelection('num-cards exceeds available selectable targets with repeat disabled.');
                    return;
                }

                const selectionItems = Array.from(displayCanonicalByKey.entries()).map((entry) => {
                    const key = entry[0];
                    const item = entry[1];
                    return {
                        id: item.id,
                        isCard: item.isCard,
                        selectable: highlightKeySet.has(key),
                        cardColor: item.cardColor,
                        cardTypeLabel: item.cardTypeLabel
                    };
                });

                g.setBoardInputEnabled(false);
                g.overlayPreviewContext = 'input';
                g.refreshCardActionButtons();
                g.appendTerminalLine(`Selection started (${numberOfSelections} slots).`);
                revealLatest();
                g.inputOverlayController.startSelectionOverlay(
                    selectionItems,
                    numberOfSelections,
                    allowRepeat,
                    allowNone,
                    topMessage,
                    (orderedSelections: string[]) => {
                        g.appendTerminalLine(`Selection -> ${orderedSelections.join(',')}`);
                        g.emitBackendEvent('input_result', {
                            input_type: 'selection',
                            message: topMessage,
                            number_of_selections: numberOfSelections,
                            allow_repeat: allowRepeat,
                            allow_none: allowNone,
                            ordered_selections: orderedSelections
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    },
                    (cardId: string) => {
                        const card = g.cardById[cardId.toUpperCase()];
                        if (card) {
                            g.overlayPreviewContext = 'input';
                            g.showCardPreview(card);
                        }
                    },
                    () => {
                        g.hideCardPreview();
                    }
                );
                return;
            }

            if (mode === 'kei-watanabe-drumkidworkshop' || mode === 'kei_watanabe_drumkidworkshop') {
                const listRaw = commandParts.slice(argsStartIndex).join(' ').trim();
                if (!listRaw) {
                    g.appendTerminalLine('Usage: input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
                    return;
                }

                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                const cleanedList = listRaw.replace(/^\[/, '').replace(/\]$/, '');
                const rawIds = cleanedList
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0);

                if (rawIds.length === 0) {
                    g.appendTerminalLine('Usage: input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
                    return;
                }

                const overlayItems: Array<{ id: string; cardColor: number; cardTypeLabel: string; hasAtk1: boolean; hasAtk2: boolean }> = [];
                const seen = new Set<string>();

                for (const rawId of rawIds) {
                    const card = g.cardById[rawId.toUpperCase()];
                    if (!card) {
                        g.appendTerminalLine(`Unknown card: ${rawId}`);
                        return;
                    }

                    if (card.getCardType() !== 'character') {
                        g.appendTerminalLine(`Only character cards are allowed: ${card.id}`);
                        return;
                    }

                    if (!card.hasAttackOne() && !card.hasAttackTwo()) {
                        g.appendTerminalLine(`Character has no attacks: ${card.id}`);
                        return;
                    }

                    if (!g.canActOnCard(card)) {
                        g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${card.id}`);
                        return;
                    }

                    const key = card.id.toLowerCase();
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);

                    overlayItems.push({
                        id: card.id,
                        cardColor: card.baseColor,
                        cardTypeLabel: card.getCardType().toUpperCase(),
                        hasAtk1: card.hasAttackOne(),
                        hasAtk2: card.hasAttackTwo()
                    });
                }

                if (overlayItems.length === 0) {
                    g.appendTerminalLine('No valid character cards provided.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.overlayPreviewContext = 'input';
                g.refreshCardActionButtons();
                g.appendTerminalLine(`Input KEI-WATANABE-DRUMKIDWORKSHOP started (${overlayItems.length} cards).`);

                g.inputOverlayController.startKeiWatanabeDrumkidWorkshopOverlay(
                    overlayItems,
                    topMessage,
                    (result: { cardId: string; attack: 'atk1' | 'atk2' }) => {
                        g.appendTerminalLine(`KEI-WATANABE-DRUMKIDWORKSHOP -> ${result.cardId} ${result.attack.toUpperCase()}`);
                        g.emitBackendEvent('input_result', {
                            input_type: 'kei_watanabe_drumkidworkshop',
                            message: topMessage,
                            card_id: result.cardId,
                            attack: result.attack,
                            attack_label: result.attack.toUpperCase()
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    },
                    (cardId: string) => {
                        const card = g.cardById[cardId.toUpperCase()];
                        if (card) {
                            g.overlayPreviewContext = 'input';
                            g.showCardPreview(card);
                        }
                    },
                    () => {
                        g.hideCardPreview();
                    }
                );
                return;
            }

            if (mode === 'numerical-entry' || mode === 'numerical_entry') {
                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine('Input NUMERICAL-ENTRY started. Type a number.');
                g.inputOverlayController.startNumericalEntryOverlay(topMessage, (value: number) => {
                    g.appendTerminalLine(`NUMERICAL-ENTRY -> ${value}`);
                    g.emitBackendEvent('input_result', {
                        input_type: 'numerical-entry',
                        message: topMessage,
                        value
                    });
                    g.clearOverlayPreviewIfActive();
                    g.setBoardInputEnabled(true);
                }, () => {
                    g.hideCardPreview();
                });
                return;
            }

            if (mode === 'd6') {
                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine('Input D6 started. Click die to roll.');
                g.inputOverlayController.startDiceRollOverlay(topMessage, (result: number) => {
                    g.appendTerminalLine(`D6 -> ${result}`);
                    g.emitBackendEvent('input_result', {
                        input_type: 'd6',
                        message: topMessage,
                        result
                    });
                    g.clearOverlayPreviewIfActive();
                    g.setBoardInputEnabled(true);
                });
                return;
            }

            if (mode === 'coin') {
                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine('Input COIN started. Click coin to flip.');
                g.inputOverlayController.startCoinFlipOverlay(topMessage, (result: 'heads' | 'tails') => {
                    g.appendTerminalLine(`COIN -> ${result.toUpperCase()}`);
                    g.emitBackendEvent('input_result', {
                        input_type: 'coin',
                        message: topMessage,
                        result,
                        result_label: result.toUpperCase()
                    });
                    g.clearOverlayPreviewIfActive();
                    g.setBoardInputEnabled(true);
                });
                return;
            }

            if (mode !== 'on' && mode !== 'off') {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            g.setBoardInputEnabled(mode === 'on');
            g.appendTerminalLine(`Input ${mode.toUpperCase()} -> ${topMessage}`);
            g.emitBackendEvent('input_state_change', {
                input_type: mode,
                message: topMessage,
                enabled: mode === 'on',
                target_view: targetView ? g.getViewModeLabel(targetView) : null
            });
            return;
        }

        if (action === 'notify') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: notify [player] [msg]');
                return;
            }

            const targetView = g.parseViewModeArg(rawArgOne.toLowerCase());
            if (!targetView || targetView === 'admin') {
                g.appendTerminalLine('Usage: notify [player-1|player-2] [msg]');
                return;
            }

            const message = commandParts.slice(2).join(' ').trim();
            if (!message) {
                g.appendTerminalLine('Usage: notify [player-1|player-2] [msg]');
                return;
            }

            if (g.inputOverlayController.hasActiveOverlay()) {
                g.appendTerminalLine('Input overlay already active.');
                return;
            }

            if (g.activeViewMode !== 'admin' && g.activeViewMode !== targetView) {
                g.appendTerminalLine(`Notify skipped in ${g.getViewModeLabel(g.activeViewMode)} view (target: ${g.getViewModeLabel(targetView)}).`);
                return;
            }

            g.setBoardInputEnabled(false);
            g.appendTerminalLine(`Notify -> ${g.getViewModeLabel(targetView)}`);
            g.inputOverlayController.startNotifyOverlay(g.getViewModeLabel(targetView), message, () => {
                g.appendTerminalLine('Notify dismissed.');
                g.emitBackendEvent('notify', {
                    target_view: g.getViewModeLabel(targetView),
                    message,
                    dismissed: true
                });
                g.setBoardInputEnabled(true);
            });
            return;
        }

        if (action === 'reveal') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: reveal [player] [list of cards]');
                return;
            }

            const targetView = g.parseViewModeArg(rawArgOne.toLowerCase());
            if (!targetView || targetView === 'admin') {
                g.appendTerminalLine('Usage: reveal [player-1|player-2] [list of cards]');
                return;
            }

            const listRaw = commandParts.slice(2).join(' ').trim();
            if (!listRaw) {
                g.appendTerminalLine('Usage: reveal [player-1|player-2] [list of cards]');
                return;
            }

            if (g.inputOverlayController.hasActiveOverlay()) {
                g.appendTerminalLine('Input overlay already active.');
                return;
            }

            if (g.activeViewMode !== 'admin' && g.activeViewMode !== targetView) {
                g.appendTerminalLine(`Reveal skipped in ${g.getViewModeLabel(g.activeViewMode)} view (target: ${g.getViewModeLabel(targetView)}).`);
                return;
            }

            const cleanedList = listRaw.replace(/^\[/, '').replace(/\]$/, '');
            const revealCards = cleanedList
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
                .map((entry) => {
                    const normalized = entry.toUpperCase();
                    const card = g.cardById[normalized];
                    if (card) {
                        return {
                            id: card.id,
                            cardColor: card.baseColor,
                            cardTypeLabel: card.getCardType().toUpperCase(),
                            isKnownCard: true
                        };
                    }

                    return {
                        id: normalized,
                        cardColor: 0x334155,
                        cardTypeLabel: 'CARD',
                        isKnownCard: false
                    };
                });

            g.setBoardInputEnabled(false);
            g.overlayPreviewContext = 'reveal';
            g.refreshCardActionButtons();
            g.appendTerminalLine(`Reveal -> ${g.getViewModeLabel(targetView)} (${revealCards.length})`);
            g.inputOverlayController.startRevealOverlay(
                g.getViewModeLabel(targetView),
                revealCards,
                () => {
                    g.overlayPreviewContext = null;
                    g.appendTerminalLine('Reveal dismissed.');
                    g.emitBackendEvent('reveal', {
                        target_view: g.getViewModeLabel(targetView),
                        cards: revealCards,
                        dismissed: true
                    });
                    g.setBoardInputEnabled(true);
                },
                (cardId: string) => {
                    const card = g.cardById[cardId.toUpperCase()];
                    if (card) {
                        g.overlayPreviewContext = 'reveal';
                        g.showCardPreview(card);
                    }
                },
                () => {
                    g.hideCardPreview();
                }
            );
            return;
        }

        if (action === 'boom') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: boom [cardid] [asset?]');
                return;
            }

            const cardId = rawArgOne.toUpperCase();
            const card = g.cardById[cardId];

            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            if (card.getCardType() !== 'character') {
                g.appendTerminalLine(`boom only works on character cards: ${cardId}`);
                return;
            }

            const textureKey = g.resolveBoomTextureKey(rawArgTwo);
            if (!textureKey) {
                g.appendTerminalLine(`Unknown boom asset: ${rawArgTwo}`);
                g.appendTerminalLine('Try: pixelviolin.jpg, bg.png, logo.png, minecraftfont.png, font2bitmap.png');
                return;
            }

            g.playPixelViolinExplosion(card, textureKey);
            g.appendTerminalLine(`BOOM on ${cardId} with ${textureKey}`);
            return;
        }

        if (action === 'view') {
            const requestedView = rawArgOne?.toLowerCase();

            if (!requestedView) {
                const order = ['admin', 'p1', 'p2'];
                const currentIndex = order.indexOf(g.activeViewMode);
                const nextView = order[(currentIndex + 1) % order.length];
                g.applyBoardView(nextView);
                g.appendTerminalLine(`View -> ${g.getViewModeLabel(nextView)}`);
                return;
            }

            const parsedView = g.parseViewModeArg(requestedView);
            if (!parsedView) {
                g.appendTerminalLine('Usage: view [admin|player-1|player-2]');
                return;
            }

            g.applyBoardView(parsedView);
            g.appendTerminalLine(`View -> ${g.getViewModeLabel(parsedView)}`);
            return;
        }

        if (action === 'attachtool' || action === 'attach-tool') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: attach-tool [tool card id] [target character id]');
                return;
            }

            const toolCardId = rawArgOne.toUpperCase();
            const targetCardId = rawArgTwo.toUpperCase();
            const toolCard = g.cardById[toolCardId];
            const targetCard = g.cardById[targetCardId];

            if (!toolCard) {
                g.appendTerminalLine(`Unknown card: ${toolCardId}`);
                return;
            }

            if (!targetCard) {
                g.appendTerminalLine(`Unknown card: ${targetCardId}`);
                return;
            }

            if (!g.canActOnCard(toolCard)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${toolCardId}`);
                return;
            }

            if (!g.canActOnCard(targetCard)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${targetCardId}`);
                return;
            }

            if (toolCard.getCardType() !== 'tool') {
                g.appendTerminalLine(`attach-tool requires a tool card: ${toolCardId}`);
                return;
            }

            if (targetCard.getCardType() !== 'character') {
                g.appendTerminalLine(`attach-tool target must be a character: ${targetCardId}`);
                return;
            }

            if (toolCard.getOwnerId() !== targetCard.getOwnerId()) {
                g.appendTerminalLine('attach-tool requires both cards to share an owner.');
                return;
            }

            const ownerId = toolCard.getOwnerId();
            const ownerHandZone = `${ownerId}-hand`;
            const ownerBenchZone = `${ownerId}-bench`;
            const ownerActiveZone = `${ownerId}-active`;
            const targetZoneId = targetCard.getZoneId();

            if (toolCard.getZoneId() !== ownerHandZone) {
                g.appendTerminalLine(`attach-tool only works from hand (${ownerHandZone}).`);
                return;
            }

            if (targetZoneId !== ownerBenchZone && targetZoneId !== ownerActiveZone) {
                g.appendTerminalLine(`attach-tool target must be in ${ownerBenchZone} or ${ownerActiveZone}.`);
                return;
            }

            const attachTarget = g.getTopAttachmentTarget(targetCard);
            g.animateToolAttachToCard(toolCard, attachTarget, () => {
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                g.appendTerminalLine(`${toolCardId} attached to ${targetCardId}`);
                g.emitBackendEvent('attach_tool', {
                    tool_card_id: toolCardId,
                    target_card_id: targetCardId,
                    owner_id: toolCard.getOwnerId()
                });
            });
            return;
        }

        if (action === 'shuffle-animation') {
            if (g.isInteractionLockedByAnimation()) {
                g.appendTerminalLine('Cannot shuffle while another animation is running.');
                return;
            }

            const pileIds = ['p1-discard', 'p1-deck', 'p2-discard', 'p2-deck'];
            let animatedPileCount = 0;

            for (const pileId of pileIds) {
                const holder = g.cardHolderById[pileId];
                if (!holder) {
                    continue;
                }

                if (g.playShuffleAnimationForPile(holder)) {
                    animatedPileCount += 1;
                }
            }

            if (animatedPileCount === 0) {
                g.appendTerminalLine('No discard/deck pile has more than 1 card.');
                return;
            }

            g.appendTerminalLine(`Shuffle animation started on ${animatedPileCount} pile(s).`);
            g.emitBackendEvent('shuffle_animation', {
                animated_pile_count: animatedPileCount,
                pile_ids: pileIds
            });
            return;
        }

        if (action === 'unselect-all' || action === 'unselectall') {
            const targetOwner = g.activeViewMode === 'admin' ? null : g.activeViewMode;
            const resetDragCount = g.resetDraggingCards(targetOwner ?? undefined);
            const hadSelection = Boolean(g.selectedCard);
            g.clearCardSelection();

            const scopeLabel = targetOwner ? g.getPlayerTurnLabel(targetOwner) : 'ALL PLAYERS';
            const parts: string[] = [`${scopeLabel} unselect-all`];
            parts.push(`drag reset: ${resetDragCount}`);
            parts.push(`selection cleared: ${hadSelection ? 'yes' : 'no'}`);
            g.appendTerminalLine(parts.join(' | '));
            g.emitBackendEvent('unselect_all', {
                scope: scopeLabel,
                drag_reset_count: resetDragCount,
                selection_cleared: hadSelection
            });
            return;
        }

        if (action !== 'mv' || !rawArgOne || !rawArgTwo) {
            this.printHelp(g);
            return;
        }

        const cardId = rawArgOne.toUpperCase();
        const holderId = rawArgTwo.toLowerCase();
        const card = g.cardById[cardId];
        const targetHolder = g.cardHolderById[holderId];

        if (!card) {
            g.appendTerminalLine(`Unknown card: ${cardId}`);
            return;
        }

        if (!g.canActOnCard(card)) {
            g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
            return;
        }

        if (!targetHolder) {
            g.appendTerminalLine(`Unknown holder: ${holderId}`);
            return;
        }

        let insertIndex: number | undefined;
        if (rawArgThree !== undefined) {
            const parsedIndex = Number(rawArgThree);
            if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
                g.appendTerminalLine(`Invalid index: ${rawArgThree}`);
                g.appendTerminalLine('Index must be a non-negative integer.');
                return;
            }

            if (parsedIndex > targetHolder.cards.length) {
                g.appendTerminalLine(`Index out of range: ${parsedIndex}`);
                g.appendTerminalLine(`Valid range for ${holderId}: 0-${targetHolder.cards.length}`);
                return;
            }

            insertIndex = parsedIndex;
        }

        if (card.getZoneId() === holderId) {
            g.appendTerminalLine(`${cardId} already in ${holderId}`);
            return;
        }

        if (card.getAttachedToCardId()) {
            g.detachCard(card);
        }

        const fromZoneId = card.getZoneId();
        const fromX = card.x;
        const fromY = card.y;
        g.moveCardToZone(card, holderId, () => {
            g.layoutAllHolders();
            g.redrawAllCardMarks();
            const toX = card.x;
            const toY = card.y;

            g.animateCardBetweenPoints(card, fromX, fromY, toX, toY, () => {
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                if (typeof g.selectCard === 'function') {
                    g.selectCard(card);
                }
                if (insertIndex !== undefined) {
                    g.appendTerminalLine(`${cardId} -> ${holderId}[${insertIndex}]`);
                    g.emitBackendEvent('card_moved', {
                        card_id: cardId,
                        from_zone_id: fromZoneId,
                        to_zone_id: holderId,
                        insert_index: insertIndex
                    });
                    return;
                }
                g.appendTerminalLine(`${cardId} -> ${holderId}`);
                g.emitBackendEvent('card_moved', {
                    card_id: cardId,
                    from_zone_id: fromZoneId,
                    to_zone_id: holderId
                });
            });
        }, insertIndex);
    }

    private printHelp (g: any): void
    {
        g.appendTerminalLine('Commands:');
        g.appendTerminalLine('  help | ?');
        g.appendTerminalLine('  mv [cardid] [cardholderid] [index?]');
        g.appendTerminalLine('  attach-tool [tool card id] [target character id]');
        g.appendTerminalLine('    alias: attachtool');
        g.appendTerminalLine('  shuffle-animation');
        g.appendTerminalLine('  unselect-all');
        g.appendTerminalLine('    alias: unselectall');
        g.appendTerminalLine('  notify [player-1|player-2] [msg]');
        g.appendTerminalLine('  reveal [player-1|player-2] [list of cards]');
        g.appendTerminalLine('  game-phase [no-input|phase2|atk]');
        g.appendTerminalLine('    alias: phase');
        g.appendTerminalLine('  player-turn [player-1|player-2]');
        g.appendTerminalLine('    alias: turn');
        g.appendTerminalLine('  stat [player-1|player-2] [attribute] [value]');
        g.appendTerminalLine('  hp [cardid] [hp] [maxhp]');
        g.appendTerminalLine('  border [cardid] [hex]');
        g.appendTerminalLine('  flip [cardid]');
        g.appendTerminalLine('  rm [energyid]');
        g.appendTerminalLine('  boom [cardid] [asset?]');
        g.appendTerminalLine('  view [admin|player-1|player-2]');
        g.appendTerminalLine('    note: "view" with no args cycles views');
        g.appendTerminalLine('  input [type] [msg] [..args]');
        g.appendTerminalLine('  input [type] [player-1|player-2] [msg] [..args]');
        g.appendTerminalLine('    types: on, off, d6, coin, selection, kei-watanabe-drumkidworkshop, numerical-entry');
        g.appendTerminalLine('    input selection [msg] [display1,display2], [highlight1,highlight2], [num-cards], [allow-repeat] [allow-none]');
        g.appendTerminalLine('    input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
        g.appendTerminalLine('      alias type: kei_watanabe_drumkidworkshop');
        g.appendTerminalLine('    input numerical-entry [msg]');
        g.appendTerminalLine('      alias type: numerical_entry');
    }

}
