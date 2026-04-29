import { AVGE_CARD_TYPE_BORDER_COLORS, GAME_CARD_TYPE_FILL_COLORS } from '../config';

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

        if (typeof g.setCommandExecutionInProgress === 'function') {
            g.setCommandExecutionInProgress(true);
        }

        try {

        g.appendTerminalLine(`> ${command}`);
        const isBackendReplayCommand = Boolean(g.scannerCommandInProgress);

        const commandParts = command.split(/\s+/);
        const [rawAction, rawArgOne, rawArgTwo, rawArgThree] = commandParts;
        const action = rawAction.toLowerCase();

        const parseBooleanArg = (rawValue: string): boolean | null => {
            const normalized = rawValue.toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
                return true;
            }
            if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
                return false;
            }
            return null;
        };

        const parseTimeoutToken = (rawValue: string): number | null => {
            const normalized = rawValue.trim().toLowerCase();
            if (normalized === 'none' || normalized === 'null') {
                return -1;
            }
            if (!/^-?\d+$/.test(normalized)) {
                return null;
            }

            const parsed = Number.parseInt(normalized, 10);
            if (!Number.isFinite(parsed)) {
                return null;
            }
            if (parsed < -1) {
                return null;
            }
            return parsed;
        };

        const normalizeStatusKey = (rawStatus: string): 'Arranger' | 'Goon' | 'Maid' | null => {
            const normalized = rawStatus.trim().toLowerCase();
            if (normalized === 'arranger' || normalized === 'arr' || normalized === 'a') {
                return 'Arranger';
            }
            if (normalized === 'goon' || normalized === 'g') {
                return 'Goon';
            }
            if (normalized === 'maid' || normalized === 'm') {
                return 'Maid';
            }
            return null;
        };

        const resolveCardById = (rawId: string): any => {
            const direct = g.cardById[rawId] ?? g.cardById[rawId.toUpperCase()] ?? g.cardById[rawId.toLowerCase()];
            if (direct) {
                return direct;
            }

            const target = rawId.toLowerCase();
            const matchedKey = Object.keys(g.cardById).find((key) => key.toLowerCase() === target);
            return matchedKey ? g.cardById[matchedKey] : undefined;
        };

        const resolveEnergyTokenById = (rawId: string): any => {
            const direct = g.energyTokenById[rawId] ?? g.energyTokenById[rawId.toUpperCase()] ?? g.energyTokenById[rawId.toLowerCase()];
            if (direct) {
                return direct;
            }

            const target = rawId.toLowerCase();
            const matchedKey = Object.keys(g.energyTokenById).find((key) => key.toLowerCase() === target);
            return matchedKey ? g.energyTokenById[matchedKey] : undefined;
        };

        const emitCommandEvent = (eventType: string, responseData: Record<string, unknown>): void => {
            // Replay commands coming from backend must not be re-emitted back to
            // backend, otherwise each client echoes the same event and creates
            // a command feedback loop.
            const isResponseEvent =
                eventType === 'notify'
                || eventType === 'reveal'
                || eventType === 'input_result'
                || eventType === 'input_state_change'
                || eventType === 'winner';
            if (isBackendReplayCommand && !isResponseEvent) {
                return;
            }
            g.emitBackendEvent(eventType, responseData);
        };

        const normalizeInputMode = (rawMode: string): string => {
            return rawMode.trim().toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
        };

        const parseLeadingMessageAndRest = (rawValue: string): { message: string; rest: string } | null => {
            const trimmed = rawValue.trim();
            if (!trimmed) {
                return null;
            }

            const firstChar = trimmed[0];
            if (firstChar !== '"' && firstChar !== '\'') {
                const firstSpaceIndex = trimmed.search(/\s/);
                if (firstSpaceIndex < 0) {
                    return { message: trimmed, rest: '' };
                }

                return {
                    message: trimmed.slice(0, firstSpaceIndex),
                    rest: trimmed.slice(firstSpaceIndex + 1).trim()
                };
            }

            for (let i = 1; i < trimmed.length; i += 1) {
                const ch = trimmed[i];
                if (ch !== firstChar) {
                    continue;
                }

                let backslashCount = 0;
                for (let j = i - 1; j >= 0 && trimmed[j] === '\\'; j -= 1) {
                    backslashCount += 1;
                }

                // Quote is escaped when preceded by an odd number of backslashes.
                if (backslashCount % 2 === 1) {
                    continue;
                }

                const message = trimmed
                    .slice(1, i)
                    .replace(/\\"/g, '"')
                    .replace(/\\'/g, "'")
                    .replace(/\\\\/g, '\\');
                const rest = trimmed.slice(i + 1).trim();
                return { message, rest };
            }

            return null;
        };

        const parseForcedNumericResults = (rawValue: string, minValue: number, maxValue: number): number[] | null => {
            const trimmed = rawValue.trim();
            if (!trimmed) {
                return null;
            }

            let normalized = trimmed;
            if (normalized.startsWith('[') && normalized.endsWith(']')) {
                normalized = normalized.slice(1, -1).trim();
            }
            if (!normalized) {
                return null;
            }

            let tokens = normalized
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);

            if (tokens.length === 1 && /\s+/.test(tokens[0])) {
                tokens = tokens[0]
                    .split(/\s+/)
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0);
            }

            if (tokens.length === 0) {
                return null;
            }

            const values: number[] = [];
            for (const token of tokens) {
                if (!/^-?\d+$/.test(token)) {
                    return null;
                }
                const parsed = Number.parseInt(token, 10);
                if (!Number.isFinite(parsed) || parsed < minValue || parsed > maxValue) {
                    return null;
                }
                values.push(parsed);
            }

            return values;
        };

        if (action === 'help' || action === '?') {
            this.printHelp(g);
            return;
        }

        if (action === 'unlock-input' || action === 'unlock_input') {
            g.remoteInputLockActive = false;
            g.setBoardInputEnabled(true);
            g.appendTerminalLine('Input unlocked after notify ACK.');
            return;
        }

        if (action === 'lock-input' || action === 'lock_input') {
            g.remoteInputLockActive = true;
            g.setBoardInputEnabled(false, false);
            g.appendTerminalLine('Input locked while remote client processes animation.');
            return;
        }

        if (action === 'resync') {
            g.appendTerminalLine('Requesting authoritative environment sync.');
            if (typeof g.enqueueProtocolPacket === 'function') {
                g.enqueueProtocolPacket('request_environment', {});
            }
            return;
        }

        if (action === 'rm') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: rm [energyid]');
                return;
            }

            const tokenId = rawArgOne;

            const token = resolveEnergyTokenById(tokenId);
            if (!token) {
                g.appendTerminalLine(`Unknown energy token: ${tokenId}`);
                return;
            }

            if (!g.canActOnToken(token)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ENERGY-${tokenId}`);
                return;
            }

            const fromZoneId = token.getZoneId();
            const fromAttachedToCardId = token.getAttachedToCardId();
            g.animateEnergyTokenToZone(token, 'energy-discard');
            g.appendTerminalLine(`ENERGY-${tokenId} -> energy-discard`);
            emitCommandEvent('energy_moved', {
                energy_id: token.id,
                owner_id: token.ownerId,
                from_zone_id: fromZoneId,
                to_zone_id: 'energy-discard',
                from_attached_to_card_id: fromAttachedToCardId,
                to_attached_to_card_id: null,
                reason: 'rm',
                interaction: 'command'
            });
            return;
        }

        if (action === 'create-energy' || action === 'create_energy') {
            if (commandParts.length < 4 || commandParts.length > 5) {
                g.appendTerminalLine('Usage: create_energy [energyid] [shared-energy|energy-discard] [attached_card_id|none] [owner_id?]');
                return;
            }

            const tokenId = commandParts[1];

            const holderId = commandParts[2].toLowerCase();
            if (!g.energyHolderById[holderId]) {
                g.appendTerminalLine(`Unknown energy holder: ${holderId}`);
                return;
            }

            const attachedArg = commandParts[3];
            const attachedToCardId = attachedArg.toLowerCase() === 'none' ? null : attachedArg.toUpperCase();
            const attachedCard = attachedToCardId ? resolveCardById(attachedToCardId) : null;
            if (attachedToCardId && !attachedCard) {
                g.appendTerminalLine(`Unknown attached card: ${attachedToCardId}`);
                return;
            }

            const ownerArg = commandParts[4];
            const ownerFromArg = typeof ownerArg === 'string' ? g.parsePlayerTurnArg(ownerArg) : null;
            const fallbackOwner = g.playerTurn ?? 'p1';
            const ownerId = attachedCard
                ? attachedCard.getOwnerId()
                : (ownerFromArg ?? (typeof ownerArg === 'string' && ownerArg.trim().length > 0 ? ownerArg.trim().toLowerCase() : fallbackOwner));

            const result = g.createEnergyTokenFromCommand({
                id: tokenId,
                ownerId,
                holderId,
                radius: g.getDefaultEnergyTokenRadius(),
                attachedToCardId
            });

            if (!result.ok) {
                g.appendTerminalLine(result.error ?? 'create_energy failed');
                return;
            }

            g.appendTerminalLine(`ENERGY-${tokenId} created in ${holderId}`);
            emitCommandEvent('energy_created', {
                energy_id: tokenId,
                owner_id: ownerId,
                holder_id: holderId,
                attached_to_card_id: attachedToCardId
            });
            return;
        }

        if (action === 'create-card' || action === 'create_card') {
            if (commandParts.length !== 12) {
                g.appendTerminalLine('Usage: create_card [cardid] [player-1|player-2] [character|tool|item|stadium|supporter] [cardholderid] [card_class] [has_atk_1] [has_active] [has_atk_2] [hp] [maxhp] [attached_card_id|none]');
                return;
            }

            const cardId = commandParts[1].toUpperCase();
            const ownerId = g.parsePlayerTurnArg(commandParts[2]);
            if (!ownerId) {
                g.appendTerminalLine('Usage: create_card [cardid] [player-1|player-2] [character|tool|item|stadium|supporter] [cardholderid] [card_class] [has_atk_1] [has_active] [has_atk_2] [hp] [maxhp] [attached_card_id|none]');
                return;
            }

            const cardType = g.parseCardTypeArg(commandParts[3]);
            if (!cardType) {
                g.appendTerminalLine(`Invalid card type: ${commandParts[3]}`);
                return;
            }

            const holderId = commandParts[4].toLowerCase();
            if (!g.cardHolderById[holderId]) {
                g.appendTerminalLine(`Unknown card holder: ${holderId}`);
                return;
            }

            const cardClass = commandParts[5];
            const hasAtk1 = parseBooleanArg(commandParts[6]);
            const hasActive = parseBooleanArg(commandParts[7]);
            const hasAtk2 = parseBooleanArg(commandParts[8]);
            if (hasAtk1 === null || hasActive === null || hasAtk2 === null) {
                g.appendTerminalLine('has_atk_1, has_active, and has_atk_2 must be true/false, 1/0, yes/no, or on/off.');
                return;
            }

            const hp = Number(commandParts[9]);
            const maxHp = Number(commandParts[10]);
            const attachedArg = commandParts[11];
            const attachedToCardId = attachedArg.toLowerCase() === 'none' ? null : attachedArg.toUpperCase();

            if (!Number.isFinite(hp) || !Number.isFinite(maxHp)) {
                g.appendTerminalLine('hp and maxhp must be numeric values.');
                return;
            }

            const result = g.createCardFromCommand({
                id: cardId,
                ownerId,
                cardType,
                holderId,
                color: GAME_CARD_TYPE_FILL_COLORS[cardType as keyof typeof GAME_CARD_TYPE_FILL_COLORS] ?? GAME_CARD_TYPE_FILL_COLORS.item,
                AVGECardType: 'NONE',
                AVGECardClass: cardClass,
                hasAtk1,
                hasActive,
                hasAtk2,
                hp,
                maxHp,
                statusEffect: {
                    Arranger: 0,
                    Goon: 0,
                    Maid: 0
                },
                width: g.objectWidth,
                height: g.objectHeight,
                flipped: false,
                attachedToCardId
            });

            if (!result.ok) {
                g.appendTerminalLine(result.error ?? 'create_card failed');
                return;
            }

            g.appendTerminalLine(`${cardId} created in ${holderId}`);
            emitCommandEvent('card_created', {
                card_id: cardId,
                owner_id: ownerId,
                card_type: cardType,
                holder_id: holderId,
                card_class: cardClass,
                has_atk_1: hasAtk1,
                has_active: hasActive,
                has_atk_2: hasAtk2,
                hp,
                maxhp: maxHp,
                attached_to_card_id: attachedToCardId
            });
            return;
        }

        if (action === 'set_status' || action === 'set-status') {
            if (!rawArgOne || !rawArgTwo || !rawArgThree) {
                g.appendTerminalLine('Usage: set_status [card_id] [status_effect] [count]');
                g.appendTerminalLine('status_effect: arranger|goon|maid');
                return;
            }

            const card = resolveCardById(rawArgOne);
            if (!card) {
                g.appendTerminalLine(`Unknown card: ${rawArgOne}`);
                return;
            }

            if (card.getCardType() !== 'character') {
                g.appendTerminalLine(`set_status only works on character cards: ${card.id}`);
                return;
            }

            const statusKey = normalizeStatusKey(rawArgTwo);
            if (!statusKey) {
                g.appendTerminalLine(`Unknown status_effect: ${rawArgTwo}`);
                g.appendTerminalLine('status_effect: arranger|goon|maid');
                return;
            }

            const count = Number(rawArgThree);
            if (!Number.isInteger(count) || count < 0) {
                g.appendTerminalLine(`Invalid count: ${rawArgThree}`);
                g.appendTerminalLine('count must be a non-negative integer.');
                return;
            }

            card.setStatusCount(statusKey, count);
            g.redrawAllCardMarks();
            g.appendTerminalLine(`${card.id} status ${statusKey} -> ${count}`);
            emitCommandEvent('card_status_changed', {
                card_id: card.id,
                status_effect: statusKey,
                count
            });
            return;
        }

        if (action === 'mv-energy' || action === 'mvenergy' || action === 'add-energy' || action === 'addenergy') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: mv-energy [energyid] [target_card_id|shared-energy|energy-discard]');
                return;
            }

            const tokenId = rawArgOne;

            const token = resolveEnergyTokenById(tokenId);
            if (!token) {
                g.appendTerminalLine(`Unknown energy token: ${tokenId}`);
                return;
            }

            if (!g.canActOnToken(token)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ENERGY-${tokenId}`);
                return;
            }

            const fromZoneId = token.getZoneId();
            const fromAttachedToCardId = token.getAttachedToCardId();

            const targetHolderId = rawArgTwo.toLowerCase();
            const targetHolder = g.energyHolderById[targetHolderId];
            if (targetHolder) {
                g.animateEnergyTokenToZone(token, targetHolderId);
                g.appendTerminalLine(`ENERGY-${tokenId} -> ${targetHolderId}`);
                emitCommandEvent('energy_moved', {
                    energy_id: token.id,
                    owner_id: token.ownerId,
                    from_zone_id: fromZoneId,
                    to_zone_id: targetHolderId,
                    from_attached_to_card_id: fromAttachedToCardId,
                    to_attached_to_card_id: null,
                    reason: 'mv-energy',
                    interaction: 'command'
                });
                return;
            }

            const targetCard = resolveCardById(rawArgTwo);
            const targetCardId = targetCard ? targetCard.id : rawArgTwo;
            if (!targetCard) {
                g.appendTerminalLine(`Unknown target: ${rawArgTwo}`);
                return;
            }

            if (!g.canActOnCard(targetCard)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${targetCardId}`);
                return;
            }

            if (targetCard.getCardType() !== 'character') {
                g.appendTerminalLine(`mv-energy target must be a character: ${targetCardId}`);
                return;
            }

            const targetZoneId = targetCard.getZoneId();
            const targetOwnerId = targetCard.getOwnerId();
            const ownerBenchZone = `${targetOwnerId}-bench`;
            const ownerActiveZone = `${targetOwnerId}-active`;
            if (targetZoneId !== ownerBenchZone && targetZoneId !== ownerActiveZone) {
                g.appendTerminalLine(`mv-energy target must be in ${ownerBenchZone} or ${ownerActiveZone}.`);
                return;
            }

            g.animateAttachEnergyTokenToCard(token, targetCard);
            g.appendTerminalLine(`ENERGY-${tokenId} -> ${targetCardId}`);
            emitCommandEvent('energy_moved', {
                energy_id: token.id,
                owner_id: token.ownerId,
                from_zone_id: fromZoneId,
                to_zone_id: targetZoneId,
                from_attached_to_card_id: fromAttachedToCardId,
                to_attached_to_card_id: targetCard.id,
                reason: 'mv-energy',
                interaction: 'command'
            });
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

            const card = resolveCardById(rawArgOne);
            const cardId = card ? card.id : rawArgOne;

            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
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

            const cardId = rawArgOne;
            const hp = Number(rawArgTwo);
            const maxHp = Number(rawArgThree);
            const card = resolveCardById(cardId);

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

            if (typeof g.animateCardHpChange === 'function') {
                g.animateCardHpChange(card, hp, maxHp);
            }
            else {
                card.setHpValues(hp, maxHp);
                g.redrawAllCardMarks();
            }
            g.appendTerminalLine(`${cardId} HP -> [${hp}/${maxHp}]`);
            return;
        }

        if (action === 'maxhp' || action === 'max-hp') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: maxhp [cardid] [maxhp]');
                g.appendTerminalLine('   or: max-hp [cardid] [maxhp]');
                return;
            }

            const cardId = rawArgOne;
            const maxHp = Number(rawArgTwo);
            const card = resolveCardById(cardId);

            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            if (card.getCardType() !== 'character') {
                g.appendTerminalLine(`maxhp only works on character cards: ${cardId}`);
                return;
            }

            if (!Number.isFinite(maxHp) || maxHp < 0) {
                g.appendTerminalLine('maxhp must be a non-negative number.');
                return;
            }

            const clampedHp = Math.min(card.getHp(), maxHp);
            card.setHpValues(clampedHp, maxHp);
            g.redrawAllCardMarks();
            g.appendTerminalLine(`${cardId} HP -> [${clampedHp}/${maxHp}]`);
            emitCommandEvent('card_maxhp_changed', {
                card_id: card.id,
                hp: clampedHp,
                maxhp: maxHp
            });
            return;
        }

        if (action === 'border') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: border [cardid] [hex]');
                return;
            }

            const card = resolveCardById(rawArgOne);
            const cardId = card ? card.id : rawArgOne;
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

        if (action === 'changetype' || action === 'change-type') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: changetype [cardid] [NONE|WW|PERC|PIANO|STRING|GUITAR|CHOIR|BRASS]');
                g.appendTerminalLine('   or: change-type [cardid] [NONE|WW|PERC|PIANO|STRING|GUITAR|CHOIR|BRASS]');
                return;
            }

            const card = resolveCardById(rawArgOne);
            const cardId = card ? card.id : rawArgOne;
            if (!card) {
                g.appendTerminalLine(`Unknown card: ${cardId}`);
                return;
            }

            if (!g.canActOnCard(card)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
                return;
            }

            const rawType = rawArgTwo.trim().toUpperCase();
            if (!rawType) {
                g.appendTerminalLine(`Invalid AVGE card type: ${rawArgTwo}`);
                return;
            }

            const nextType = rawType === 'ALL' ? 'NONE' : rawType;
            if (typeof card.setAVGECardType === 'function') {
                card.setAVGECardType(nextType);
            }
            else {
                card.body.setData('AVGECardType', nextType);
                const fallbackColor = AVGE_CARD_TYPE_BORDER_COLORS[nextType as keyof typeof AVGE_CARD_TYPE_BORDER_COLORS] ?? card.getBorderColor();
                card.setBorderColor(fallbackColor);
            }

            const color = AVGE_CARD_TYPE_BORDER_COLORS[nextType as keyof typeof AVGE_CARD_TYPE_BORDER_COLORS] ?? card.getBorderColor();
            g.redrawAllCardMarks();
            g.appendTerminalLine(`${cardId} type -> ${nextType} (#${color.toString(16).padStart(6, '0').toUpperCase()})`);
            return;
        }

        if (action === 'input') {
            if (!rawArgOne || !rawArgTwo) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            const mode = normalizeInputMode(rawArgOne);
            const actionPrefixLength = rawAction.length;
            const rawAfterAction = command.slice(actionPrefixLength).trim();
            const modeTokenMatch = /^([^\s]+)\s*(.*)$/.exec(rawAfterAction);
            if (!modeTokenMatch) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            let rawInputBody = modeTokenMatch[2].trim();
            if (!rawInputBody) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            const targetTokenMatch = /^([^\s]+)\s*(.*)$/.exec(rawInputBody);
            const possibleTargetToken = targetTokenMatch ? targetTokenMatch[1] : '';
            const parsedTargetView = possibleTargetToken
                ? g.parseViewModeArg(possibleTargetToken.toLowerCase())
                : null;
            const targetView = parsedTargetView === 'p1' || parsedTargetView === 'p2' ? parsedTargetView : null;
            if (targetView && targetTokenMatch) {
                rawInputBody = targetTokenMatch[2].trim();
            }

            const parsedMessage = parseLeadingMessageAndRest(rawInputBody);
            const rawTopMessage = parsedMessage?.message ?? '';
            const topMessage = rawTopMessage
                .replace(/_+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const rawInputArgs = parsedMessage?.rest ?? '';
            const canShowTargetedInputInCurrentView = !targetView || g.activeViewMode === targetView;

            if (!topMessage) {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            if (!canShowTargetedInputInCurrentView) {
                g.appendTerminalLine(`Input routed to ${g.getViewModeLabel(targetView)} (current: ${g.getViewModeLabel(g.activeViewMode)}).`);
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

                if (!rawInputArgs) {
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

                const selectionTail = rawInputArgs.trim();
                const selectionArgsMatch = selectionTail.match(/^\[([^\]]*)\]\s*,?\s*\[([^\]]*)\]\s*,?\s*([^,\s]+)\s*,?\s*([^,\s]+)\s*,?\s*([^,\s]+)$/);
                if (!selectionArgsMatch) {
                    failSelection(
                        'Usage: input selection [msg] [display1,display2], [highlight1,highlight2], [num-cards], [allow-repeat] [allow-none]'
                    );
                    return;
                }

                const displayListToken = selectionArgsMatch[1].trim();
                const highlightListToken = selectionArgsMatch[2].trim();
                const numCardsToken = selectionArgsMatch[3].trim();
                const allowRepeatToken = selectionArgsMatch[4].trim().toLowerCase();
                const allowNoneToken = selectionArgsMatch[5].trim().toLowerCase();
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
                    .map((item) => item.trim().replace(/^\[+/, '').replace(/\]+$/, '').replace(/,$/, '').trim())
                    .filter((item) => item.length > 0);

                if (displayItemsRaw.length === 0) {
                    if (!allowNone) {
                        failSelection('Display list cannot be empty.');
                        return;
                    }
                    revealLatest();
                }

                const highlightItemsRaw = highlightListToken
                    .split(',')
                    .map((item) => item.trim().replace(/^\[+/, '').replace(/\]+$/, '').replace(/,$/, '').trim())
                    .filter((item) => item.length > 0);

                if (highlightItemsRaw.length === 0 && !allowNone && numberOfSelections > 0) {
                    failSelection('Highlight list cannot be empty when allow-none is false.');
                    return;
                }

                const toCanonicalId = (itemId: string): string => {
                    const card = resolveCardById(itemId);
                    return card ? card.id : itemId;
                };

                const displayCanonicalByKey = new Map<string, {
                    id: string;
                    isCard: boolean;
                    cardColor?: number;
                    cardClassLabel?: string;
                    cardTypeLabel?: string;
                }>();
                for (const itemId of displayItemsRaw) {
                    const card = resolveCardById(itemId);
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
                        cardClassLabel: card?.getCardClass(),
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

                const selectableCount = highlightKeySet.size;
                if (!allowRepeat && !allowNone && numberOfSelections > selectableCount) {
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
                        cardClassLabel: item.cardClassLabel,
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
                        emitCommandEvent('input_result', {
                            input_type: 'selection',
                            inputType: 'selection',
                            message: topMessage,
                            number_of_selections: numberOfSelections,
                            numberOfSelections: numberOfSelections,
                            allow_repeat: allowRepeat,
                            allowRepeat,
                            allow_none: allowNone,
                            allowNone,
                            ordered_selections: orderedSelections,
                            orderedSelections
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    },
                    (cardId: string) => {
                        const card = resolveCardById(cardId);
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

            if (mode === 'kei-watanabe-drumkidworkshop') {
                const listRaw = rawInputArgs.trim();
                if (!listRaw) {
                    g.appendTerminalLine('Usage: input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
                    return;
                }

                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                const cleanedList = listRaw.replace(/\[/g, '').replace(/\]/g, '');
                const rawIds = cleanedList
                    .split(',')
                    .map((entry) => entry.trim().replace(/^\[+/, '').replace(/\]+$/, ''))
                    .filter((entry) => entry.length > 0);

                if (rawIds.length === 0) {
                    g.appendTerminalLine('Usage: input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
                    return;
                }

                const overlayItems: Array<{ id: string; cardClassLabel: string; cardColor: number; cardTypeLabel: string; hasAtk1: boolean; hasAtk2: boolean }> = [];
                const seen = new Set<string>();

                for (const rawId of rawIds) {
                    const card = resolveCardById(rawId);
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
                        cardClassLabel: card.getCardClass(),
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
                        emitCommandEvent('input_result', {
                            input_type: 'kei_watanabe_drumkidworkshop',
                            inputType: 'kei_watanabe_drumkidworkshop',
                            message: topMessage,
                            card_id: result.cardId,
                            cardId: result.cardId,
                            attack: result.attack,
                            attack_label: result.attack.toUpperCase()
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    },
                    (cardId: string) => {
                        const card = resolveCardById(cardId);
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

            if (mode === 'numerical-entry') {
                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine('Input NUMERICAL-ENTRY started. Type a number.');
                g.inputOverlayController.startNumericalEntryOverlay(topMessage, (value: number) => {
                    g.appendTerminalLine(`NUMERICAL-ENTRY -> ${value}`);
                    emitCommandEvent('input_result', {
                        input_type: 'numerical-entry',
                        inputType: 'numerical-entry',
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
                const forcedValues = parseForcedNumericResults(rawInputArgs, 1, 6);
                if (!forcedValues || forcedValues.length === 0) {
                    g.appendTerminalLine('Usage: input d6 [msg] [1-6]');
                    g.appendTerminalLine('   or: input d6 [player-1|player-2] [msg] [1-6]');
                    g.appendTerminalLine('   or: input d6 [msg] [v1,v2,...]');
                    return;
                }

                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine(`Input D6 started. Click die to reveal ${forcedValues.join(',')}.`);

                const rolledValues: number[] = [];
                const totalRolls = forcedValues.length;

                const runRollAtIndex = (index: number): void => {
                    const stepMessage = totalRolls > 1 ? `${topMessage} ${index + 1}/${totalRolls}` : topMessage;
                    g.inputOverlayController.startDiceRollOverlay(stepMessage, (result: number) => {
                        rolledValues.push(result);
                        g.appendTerminalLine(`D6 ${index + 1}/${totalRolls} -> ${result}`);

                        if (index + 1 < totalRolls) {
                            runRollAtIndex(index + 1);
                            return;
                        }

                        const firstResult = rolledValues[0] ?? forcedValues[0];
                        emitCommandEvent('input_result', {
                            input_type: 'd6',
                            inputType: 'd6',
                            message: topMessage,
                            result: firstResult,
                            result_value: firstResult,
                            resultValue: firstResult,
                            result_values: rolledValues,
                            resultValues: rolledValues
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    }, forcedValues[index]);
                };

                runRollAtIndex(0);
                return;
            }

            if (mode === 'coin') {
                const forcedValues = parseForcedNumericResults(rawInputArgs, 0, 1);
                if (!forcedValues || forcedValues.length === 0) {
                    g.appendTerminalLine('Usage: input coin [msg] [0|1]');
                    g.appendTerminalLine('   or: input coin [player-1|player-2] [msg] [0|1]');
                    g.appendTerminalLine('   or: input coin [msg] [v1,v2,...] where each v is 0 or 1');
                    return;
                }

                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                g.setBoardInputEnabled(false);
                g.appendTerminalLine(`Input COIN started. Click coin to reveal ${forcedValues.join(',')}.`);

                const resultValues: number[] = [];
                const resultLabels: string[] = [];
                const totalFlips = forcedValues.length;

                const runFlipAtIndex = (index: number): void => {
                    const forcedResult = forcedValues[index] === 1 ? 'heads' : 'tails';
                    const stepMessage = totalFlips > 1 ? `${topMessage} ${index + 1}/${totalFlips}` : topMessage;
                    g.inputOverlayController.startCoinFlipOverlay(stepMessage, (result: 'heads' | 'tails') => {
                        const resultValue = result === 'heads' ? 1 : 0;
                        resultValues.push(resultValue);
                        resultLabels.push(result.toUpperCase());
                        g.appendTerminalLine(`COIN ${index + 1}/${totalFlips} -> ${result.toUpperCase()}`);

                        if (index + 1 < totalFlips) {
                            runFlipAtIndex(index + 1);
                            return;
                        }

                        const firstResultValue = resultValues[0] ?? forcedValues[0];
                        const firstResultLabel = firstResultValue === 1 ? 'HEADS' : 'TAILS';
                        emitCommandEvent('input_result', {
                            input_type: 'coin',
                            inputType: 'coin',
                            message: topMessage,
                            result: firstResultLabel.toLowerCase(),
                            result_value: firstResultValue,
                            resultValue: firstResultValue,
                            result_label: firstResultLabel,
                            result_values: resultValues,
                            resultValues: resultValues,
                            result_labels: resultLabels,
                            resultLabels: resultLabels
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    }, forcedResult);
                };

                runFlipAtIndex(0);
                return;
            }

            if (mode === 'binary') {
                if (g.inputOverlayController.hasActiveOverlay()) {
                    g.appendTerminalLine('Input overlay already active.');
                    return;
                }

                const binaryItems = [
                    { id: 'NO', isCard: false, selectable: true },
                    { id: 'YES', isCard: false, selectable: true }
                ];

                g.setBoardInputEnabled(false);
                g.overlayPreviewContext = 'input';
                g.refreshCardActionButtons();
                g.appendTerminalLine('Input BINARY started. Choose 0 or 1.');
                g.inputOverlayController.startSelectionOverlay(
                    binaryItems,
                    1,
                    false,
                    false,
                    topMessage,
                    (orderedSelections: string[]) => {
                        const picked = (orderedSelections[0] ?? 'NO').trim().toUpperCase();
                        const resultValue = picked === 'YES' ? 1 : 0;
                        const resultBool = resultValue === 1;

                        g.appendTerminalLine(`BINARY -> ${picked}`);
                        emitCommandEvent('input_result', {
                            input_type: 'binary',
                            inputType: 'binary',
                            message: topMessage,
                            result: resultBool,
                            result_value: resultValue,
                            resultValue,
                            result_label: resultValue === 1 ? 'TRUE' : 'FALSE'
                        });
                        g.clearOverlayPreviewIfActive();
                        g.setBoardInputEnabled(true);
                    },
                    () => {
                        g.hideCardPreview();
                    },
                    () => {
                        g.hideCardPreview();
                    }
                );
                return;
            }

            if (mode !== 'on' && mode !== 'off') {
                g.appendTerminalLine('Usage: input [type] [msg] [..args]');
                g.appendTerminalLine('   or: input [type] [player-1|player-2] [msg] [..args]');
                g.appendTerminalLine('Types: on, off, d6, coin, binary, selection, kei_watanabe_drumkidworkshop, numerical-entry');
                return;
            }

            g.setBoardInputEnabled(mode === 'on', mode !== 'off');
            g.appendTerminalLine(`Input ${mode.toUpperCase()} -> ${topMessage}`);
            emitCommandEvent('input_state_change', {
                input_type: mode,
                inputType: mode,
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

            const normalizedNotifyTarget = rawArgOne.toLowerCase();
            const notifyBoth = normalizedNotifyTarget === 'both' || normalizedNotifyTarget === 'all';
            const targetView = notifyBoth
                ? (g.activeViewMode === 'p1' || g.activeViewMode === 'p2' ? g.activeViewMode : null)
                : g.parseViewModeArg(normalizedNotifyTarget);
            if ((!targetView || targetView === 'spectator') && !notifyBoth) {
                g.appendTerminalLine('Usage: notify [player-1|player-2|both] [msg]');
                return;
            }

            let timeoutSeconds: number | null = null;
            let messageTokens = commandParts.slice(2);
            if (messageTokens.length >= 1) {
                const maybeTimeout = parseTimeoutToken(messageTokens[messageTokens.length - 1]);
                if (maybeTimeout !== null) {
                    timeoutSeconds = maybeTimeout;
                    messageTokens = messageTokens.slice(0, -1);
                }
            }

            const message = messageTokens
                .join(' ')
                .trim()
                .replace(/_+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!message) {
                g.appendTerminalLine('Usage: notify [player-1|player-2|both] [msg]');
                return;
            }

            if (g.inputOverlayController.hasActiveOverlay()) {
                // Notify is high-priority feedback; replace any active overlay
                // so notify dismissal can always complete and ACK can be sent.
                g.inputOverlayController.stopActiveOverlay();
            }

            if (!notifyBoth && g.activeViewMode !== targetView) {
                g.appendTerminalLine(`Notify skipped in ${g.getViewModeLabel(g.activeViewMode)} view (target: ${g.getViewModeLabel(targetView)}).`);
                return;
            }

            g.setBoardInputEnabled(false);
            const notifyTargetLabel = notifyBoth ? 'BOTH PLAYERS' : g.getViewModeLabel(targetView);
            g.appendTerminalLine(`Notify -> ${notifyTargetLabel}`);
            g.inputOverlayController.startNotifyOverlay(notifyTargetLabel, message, () => {
                g.appendTerminalLine('Notify dismissed.');
                emitCommandEvent('notify', {
                    command: g.pendingNotifyCommand ?? command,
                    target_view: notifyTargetLabel,
                    message,
                    dismissed: true,
                    timeout_seconds: timeoutSeconds,
                });
            }, timeoutSeconds);
            return;
        }

        if (action === 'winner') {
            const winnerArg = commandParts.slice(1).join(' ').trim();
            if (!winnerArg) {
                g.appendTerminalLine('Usage: winner [player-1|player-2|winner_name]');
                return;
            }

            const winnerView = g.parseViewModeArg(rawArgOne.toLowerCase());
            const explicitWinnerName = winnerView
                ? commandParts.slice(2).join(' ').trim()
                : '';

            if (g.inputOverlayController.hasActiveOverlay()) {
                g.appendTerminalLine('Input overlay already active.');
                return;
            }

            const winnerLabel = (!winnerView || winnerView === 'spectator')
                ? winnerArg
                : (explicitWinnerName || g.getPlayerUsername(winnerView));

            const panelColor =
                !winnerView || winnerView === 'spectator'
                    ? 0x4b5563
                    : (g.activeViewMode === winnerView ? 0x166534 : 0x991b1b);

            g.setBoardInputEnabled(false);
            if (typeof g.markMatchEndedAwaitingExit === 'function') {
                g.markMatchEndedAwaitingExit();
            }
            g.appendTerminalLine(`WINNER -> ${winnerLabel}`);
            g.inputOverlayController.startWinnerOverlay(winnerLabel, panelColor, () => {
                emitCommandEvent('winner', {
                    winner_view: winnerView ? g.getViewModeLabel(winnerView) : winnerLabel,
                    current_view: g.getViewModeLabel(g.activeViewMode),
                    panel_color: panelColor,
                    redirected_to: 'MainMenu'
                });
                if (typeof g.returnToMainMenuAfterMatchEnd === 'function') {
                    g.returnToMainMenuAfterMatchEnd();
                }
                else {
                    g.scene.start('MainMenu');
                }
            });
            return;
        }

        if (action === 'reveal') {
            if (!rawArgOne) {
                g.appendTerminalLine('Usage: reveal [player] [list of cards]');
                return;
            }

            const normalizedRevealTarget = rawArgOne.toLowerCase();
            const revealBoth = normalizedRevealTarget === 'both' || normalizedRevealTarget === 'all';
            const targetView = revealBoth
                ? (g.activeViewMode === 'p1' || g.activeViewMode === 'p2' ? g.activeViewMode : null)
                : g.parseViewModeArg(normalizedRevealTarget);
            if ((!targetView || targetView === 'spectator') && !revealBoth) {
                g.appendTerminalLine('Usage: reveal [player-1|player-2|both] [list of cards]');
                return;
            }

            const payloadRaw = commandParts.slice(2).join(' ').trim();
            if (!payloadRaw) {
                g.appendTerminalLine('Usage: reveal [player-1|player-2|both] [list of cards]');
                return;
            }

            let listRaw = payloadRaw;
            let revealMessage = '';
            let timeoutSeconds: number | null = null;
            if (payloadRaw.startsWith('[')) {
                const listEndIndex = payloadRaw.indexOf(']');
                if (listEndIndex <= 0) {
                    g.appendTerminalLine('Usage: reveal [player-1|player-2|both] [list of cards] [message?]');
                    return;
                }
                listRaw = payloadRaw.slice(0, listEndIndex + 1).trim();
                const trailingTokens = payloadRaw
                    .slice(listEndIndex + 1)
                    .trim()
                    .split(/\s+/)
                    .filter((token) => token.length > 0);
                if (trailingTokens.length > 0) {
                    const maybeTimeout = parseTimeoutToken(trailingTokens[trailingTokens.length - 1]);
                    if (maybeTimeout !== null) {
                        timeoutSeconds = maybeTimeout;
                        trailingTokens.pop();
                    }
                }
                revealMessage = trailingTokens
                    .join(' ')
                    .trim()
                    .replace(/_+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            if (g.inputOverlayController.hasActiveOverlay()) {
                g.appendTerminalLine('Input overlay already active.');
                return;
            }

            if (!revealBoth && g.activeViewMode !== targetView) {
                g.appendTerminalLine(`Reveal skipped in ${g.getViewModeLabel(g.activeViewMode)} view (target: ${g.getViewModeLabel(targetView)}).`);
                return;
            }

            const revealTargetLabel = revealBoth ? 'BOTH PLAYERS' : g.getViewModeLabel(targetView);

            const cleanedList = listRaw.replace(/^\[/, '').replace(/\]$/, '');
            const revealCards = cleanedList
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)
                .map((entry) => {
                    const card = resolveCardById(entry);
                    if (card) {
                        return {
                            id: card.id,
                            cardClassLabel: card.getCardClass(),
                            cardColor: card.baseColor,
                            cardTypeLabel: card.getCardType().toUpperCase(),
                            isKnownCard: true
                        };
                    }

                    return {
                        id: entry,
                        cardClassLabel: 'UNKNOWN',
                        cardColor: 0x334155,
                        cardTypeLabel: 'CARD',
                        isKnownCard: false
                    };
                });

            g.setBoardInputEnabled(false);
            g.overlayPreviewContext = 'reveal';
            g.refreshCardActionButtons();
            g.inputOverlayController.startRevealOverlay(
                revealCards,
                revealMessage,
                timeoutSeconds,
                () => {
                    g.overlayPreviewContext = null;
                    g.appendTerminalLine('Reveal dismissed.');
                    emitCommandEvent('reveal', {
                        command: g.pendingNotifyCommand ?? command,
                        target_view: revealTargetLabel,
                        cards: revealCards,
                        message: revealMessage || null,
                        timeout_seconds: timeoutSeconds,
                        dismissed: true
                    });
                    g.setBoardInputEnabled(true);
                },
                (cardId: string) => {
                    const card = resolveCardById(cardId);
                    if (card) {
                        g.overlayPreviewContext = 'reveal';
                        g.showCardPreview(card, { forceFaceUp: true });
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

            const card = resolveCardById(rawArgOne);
            const cardId = card ? card.id : rawArgOne;

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
                g.appendTerminalLine('Try: background/background_element.png, logo.png, minecraftfont.png, font2bitmap.png');
                return;
            }

            g.playBoomExplosion(card, textureKey);
            g.appendTerminalLine(`BOOM on ${cardId} with ${textureKey}`);
            return;
        }

        if (action === 'view') {
            const requestedView = rawArgOne?.toLowerCase();

            if (!requestedView) {
                const order = ['p1', 'p2'];
                const currentIndex = order.indexOf(g.activeViewMode);
                const nextView = order[(currentIndex + 1) % order.length];
                g.applyBoardView(nextView);
                g.appendTerminalLine(`View -> ${g.getViewModeLabel(nextView)}`);
                return;
            }

            const parsedView = g.parseViewModeArg(requestedView);
            if (!parsedView) {
                g.appendTerminalLine('Usage: view [player-1|player-2]');
                return;
            }

            g.applyBoardView(parsedView);
            g.appendTerminalLine(`View -> ${g.getViewModeLabel(parsedView)}`);
            return;
        }

        if (action === 'shuffle-animation') {
            if (g.isInteractionLockedByAnimation()) {
                g.appendTerminalLine('Cannot shuffle while another animation is running.');
                return;
            }

            const defaultPileIds = ['p1-discard', 'p1-deck', 'p2-discard', 'p2-deck'];
            const requestedPileId = rawArgOne?.toLowerCase();
            const pileIds = requestedPileId ? [requestedPileId] : defaultPileIds;

            if (requestedPileId) {
                const isSupportedTargetPile = defaultPileIds.includes(requestedPileId);
                if (!isSupportedTargetPile) {
                    g.appendTerminalLine(`Unsupported shuffle pile: ${requestedPileId}`);
                    g.appendTerminalLine('Supported values: p1-deck, p1-discard, p2-deck, p2-discard');
                    return;
                }
            }

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
            emitCommandEvent('shuffle_animation', {
                animated_pile_count: animatedPileCount,
                pile_ids: pileIds
            });
            return;
        }

        if (action === 'unselect-all' || action === 'unselectall') {
            const targetOwner = g.activeViewMode === 'p1' || g.activeViewMode === 'p2' ? g.activeViewMode : null;
            const resetDragCount = g.resetDraggingCards(targetOwner ?? undefined);
            const hadSelection = Boolean(g.selectedCard);
            g.clearCardSelection();

            const scopeLabel = targetOwner ? g.getPlayerTurnLabel(targetOwner) : 'ALL PLAYERS';
            const parts: string[] = [`${scopeLabel} unselect-all`];
            parts.push(`drag reset: ${resetDragCount}`);
            parts.push(`selection cleared: ${hadSelection ? 'yes' : 'no'}`);
            g.appendTerminalLine(parts.join(' | '));
            emitCommandEvent('unselect_all', {
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

        const requestedCardId = rawArgOne;
        const holderId = rawArgTwo.toLowerCase();
        const card = resolveCardById(requestedCardId);
        const targetHolder = g.cardHolderById[holderId];
        const targetCard = resolveCardById(rawArgTwo);

        if (!card) {
            g.appendTerminalLine(`Unknown card: ${requestedCardId}`);
            return;
        }

        const cardId = card.id;

        if (!g.canActOnCard(card)) {
            g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${cardId}`);
            return;
        }

        if (!targetHolder && !targetCard) {
            g.appendTerminalLine(`Unknown holder/card: ${rawArgTwo}`);
            return;
        }

        if (targetCard && !targetHolder) {
            const targetCardId = targetCard.id;

            if (!g.canActOnCard(targetCard)) {
                g.appendTerminalLine(`Not allowed in ${g.getViewModeLabel(g.activeViewMode)} view: ${targetCardId}`);
                return;
            }

            if (rawArgThree !== undefined) {
                g.appendTerminalLine('Usage: mv [tool card id] [target character id]');
                return;
            }

            if (card.getCardType() !== 'tool') {
                g.appendTerminalLine(`mv card->card requires a tool source card: ${cardId}`);
                return;
            }

            if (targetCard.getCardType() !== 'character') {
                g.appendTerminalLine(`mv card->card target must be a character: ${targetCardId}`);
                return;
            }

            if (card.getOwnerId() !== targetCard.getOwnerId()) {
                g.appendTerminalLine('mv card->card requires both cards to share an owner.');
                return;
            }

            const ownerId = card.getOwnerId();
            const ownerHandZone = `${ownerId}-hand`;
            const ownerBenchZone = `${ownerId}-bench`;
            const ownerActiveZone = `${ownerId}-active`;
            const targetZoneId = targetCard.getZoneId();

            const isAlreadyAttachedUnderTarget = (): boolean => {
                let parentId = card.getAttachedToCardId();
                const visited = new Set<string>();

                while (parentId) {
                    if (parentId === targetCardId) {
                        return true;
                    }

                    if (visited.has(parentId)) {
                        break;
                    }
                    visited.add(parentId);

                    const parentCard = g.cardById[parentId];
                    if (!parentCard) {
                        break;
                    }

                    parentId = parentCard.getAttachedToCardId();
                }

                return false;
            };

            if (isAlreadyAttachedUnderTarget()) {
                g.appendTerminalLine(`${cardId} -> ${targetCardId}`);
                return;
            }

            if (card.getZoneId() !== ownerHandZone) {
                g.appendTerminalLine(`mv tool->card only works from hand (${ownerHandZone}).`);
                return;
            }

            if (targetZoneId !== ownerBenchZone && targetZoneId !== ownerActiveZone) {
                g.appendTerminalLine(`mv tool->card target must be in ${ownerBenchZone} or ${ownerActiveZone}.`);
                return;
            }

            const attachTarget = g.getTopAttachmentTarget(targetCard);
            g.animateToolAttachToCard(card, attachTarget, () => {
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                g.appendTerminalLine(`${cardId} -> ${targetCardId}`);
                emitCommandEvent('attach_tool', {
                    tool_card_id: cardId,
                    target_card_id: targetCardId,
                    owner_id: card.getOwnerId()
                });
            });
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

        const fromX = card.x;
        const fromY = card.y;

        // Backend replayed moves can occur across turn/view transitions; clear
        // any stale selection highlight before applying authoritative movement.
        if (isBackendReplayCommand && typeof g.clearCardSelection === 'function') {
            g.clearCardSelection();
        }

        g.moveCardToZone(card, holderId, () => {
            g.layoutAllHolders();
            g.redrawAllCardMarks();
            const toX = card.x;
            const toY = card.y;

            g.animateCardBetweenPoints(card, fromX, fromY, toX, toY, () => {
                g.layoutAllHolders();
                g.redrawAllCardMarks();
                if (typeof g.updateAttachedChildrenPositions === 'function') {
                    g.updateAttachedChildrenPositions(card);
                }
                // Do not force selection/highlight during backend replay updates.
                if (!isBackendReplayCommand && typeof g.selectCard === 'function') {
                    g.selectCard(card);
                }
                if (insertIndex !== undefined) {
                    g.appendTerminalLine(`${cardId} -> ${holderId}[${insertIndex}]`);
                    return;
                }
                g.appendTerminalLine(`${cardId} -> ${holderId}`);
            });
        }, insertIndex);
        }
        finally {
            if (typeof g.setCommandExecutionInProgress === 'function') {
                g.setCommandExecutionInProgress(false);
            }
        }
    }

    private printHelp (g: any): void
    {
        g.appendTerminalLine('Commands:');
        g.appendTerminalLine('  help | ?');
        g.appendTerminalLine('  mv [cardid] [cardholderid|target_character_id] [index?]');
        g.appendTerminalLine('  shuffle-animation [p1-deck|p1-discard|p2-deck|p2-discard]?');
        g.appendTerminalLine('  unselect-all');
        g.appendTerminalLine('    alias: unselectall');
        g.appendTerminalLine('  notify [player-1|player-2|both] [msg]');
        g.appendTerminalLine('  winner [player-1|player-2]');
        g.appendTerminalLine('  reveal [player-1|player-2|both] [list of cards]');
        g.appendTerminalLine('  game-phase [no-input|phase2|atk]');
        g.appendTerminalLine('    alias: phase');
        g.appendTerminalLine('  player-turn [player-1|player-2]');
        g.appendTerminalLine('    alias: turn');
        g.appendTerminalLine('  stat [player-1|player-2] [attribute] [value]');
        g.appendTerminalLine('  hp [cardid] [hp] [maxhp]');
        g.appendTerminalLine('  maxhp [cardid] [maxhp]');
        g.appendTerminalLine('    alias: max-hp');
        g.appendTerminalLine('  border [cardid] [hex]');
        g.appendTerminalLine('  changetype [cardid] [NONE|WW|PERC|PIANO|STRING|GUITAR|CHOIR|BRASS]');
        g.appendTerminalLine('    alias: change-type');
        g.appendTerminalLine('  set_status [card_id] [status_effect] [count]');
        g.appendTerminalLine('    status_effect: arranger|goon|maid');
        g.appendTerminalLine('  flip [cardid]');
        g.appendTerminalLine('  rm [energyid]');
        g.appendTerminalLine('  create_energy [energyid] [shared-energy|energy-discard] [attached_card_id|none] [owner_id?]');
        g.appendTerminalLine('    alias: create-energy');
        g.appendTerminalLine('  mv-energy [energyid] [target_card_id|shared-energy|energy-discard]');
        g.appendTerminalLine('    alias: mvenergy');
        g.appendTerminalLine('  create_card [cardid] [player-1|player-2] [character|tool|item|stadium|supporter] [cardholderid] [card_class] [has_atk_1] [has_active] [has_atk_2] [hp] [maxhp] [attached_card_id|none]');
        g.appendTerminalLine('    alias: create-card');
        g.appendTerminalLine('  boom [cardid] [asset?]');
        g.appendTerminalLine('  view [player-1|player-2]');
        g.appendTerminalLine('    note: "view" with no args cycles views');
        g.appendTerminalLine('  input [type] [msg] [..args]');
        g.appendTerminalLine('  input [type] [player-1|player-2] [msg] [..args]');
        g.appendTerminalLine('    types: on, off, d6, coin, binary, selection, kei-watanabe-drumkidworkshop, numerical-entry');
        g.appendTerminalLine('    input d6 [msg] [1-6]');
        g.appendTerminalLine('    input d6 [player-1|player-2] [msg] [1-6]');
        g.appendTerminalLine('    input coin [msg] [0|1]   (0=tails, 1=heads)');
        g.appendTerminalLine('    input coin [player-1|player-2] [msg] [0|1]   (0=tails, 1=heads)');
        g.appendTerminalLine('    input binary [msg]');
        g.appendTerminalLine('    input binary [player-1|player-2] [msg]');
        g.appendTerminalLine('    input selection [msg] [display1,display2], [highlight1,highlight2], [num-cards], [allow-repeat] [allow-none]');
        g.appendTerminalLine('    input kei-watanabe-drumkidworkshop [msg] [card1,card2,...]');
        g.appendTerminalLine('      alias type: kei_watanabe_drumkidworkshop');
        g.appendTerminalLine('    input numerical-entry [msg]');
        g.appendTerminalLine('      alias type: numerical_entry');
    }

}
