import { Scene } from 'phaser';
import { Card } from '../entities';
import cardPreviewDescriptionsJson from '../data/cardPreviewDescriptions.json';
import {
    BASE_HEIGHT,
    BASE_WIDTH,
    CARD_BORDER_WIDTH,
    CARD_VISUALS,
    GAME_DEPTHS,
    GAME_HEIGHT,
    GAME_PREVIEW_LAYOUT,
    GAME_WIDTH,
    UI_SCALE
} from '../config';
import { fitBitmapTextToSingleLine } from './overlays/bitmapTextFit';

type CardPreviewDescriptionEntry = {
    atk1Description?: string;
    atk2Description?: string;
    abilityName?: string;
    abilityDescription?: string;
    flavorText?: string;
};

type CardPreviewDescriptionCatalog = {
    characterDefaults?: CardPreviewDescriptionEntry;
    otherCardDefaults?: CardPreviewDescriptionEntry;
    cards?: Record<string, CardPreviewDescriptionEntry>;
};

const normalizeCardDescriptionKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const readSingleLineField = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : fallback;
};

const readMultiLineField = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalizedLines = value
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '));

    while (normalizedLines.length > 0 && normalizedLines[0] === '') {
        normalizedLines.shift();
    }

    while (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] === '') {
        normalizedLines.pop();
    }

    const collapsed = normalizedLines.join('\n').trim();
    return collapsed.length > 0 ? collapsed : fallback;
};

const cardPreviewDescriptionCatalog = cardPreviewDescriptionsJson as CardPreviewDescriptionCatalog;

const characterDefaultDescription = {
    atk1Description: readMultiLineField(cardPreviewDescriptionCatalog.characterDefaults?.atk1Description, '(add atk1 description)'),
    atk2Description: readMultiLineField(cardPreviewDescriptionCatalog.characterDefaults?.atk2Description, '(add atk2 description)'),
    abilityName: readSingleLineField(cardPreviewDescriptionCatalog.characterDefaults?.abilityName, '(add ability name)'),
    abilityDescription: readMultiLineField(cardPreviewDescriptionCatalog.characterDefaults?.abilityDescription, '(add ability description)'),
    flavorText: readMultiLineField(cardPreviewDescriptionCatalog.characterDefaults?.flavorText, '(add flavor text)'),
};

const otherCardDefaultDescription = {
    abilityDescription: readMultiLineField(cardPreviewDescriptionCatalog.otherCardDefaults?.abilityDescription, '(add ability description)'),
};

const cardPreviewDescriptionByKey = new Map<string, CardPreviewDescriptionEntry>();
for (const [rawCardClass, rawEntry] of Object.entries(cardPreviewDescriptionCatalog.cards ?? {})) {
    if (typeof rawEntry !== 'object' || rawEntry === null) {
        continue;
    }

    cardPreviewDescriptionByKey.set(normalizeCardDescriptionKey(rawCardClass), rawEntry as CardPreviewDescriptionEntry);
}

const resolveCardPreviewDescriptionEntry = (cardClass: string): CardPreviewDescriptionEntry => {
    return cardPreviewDescriptionByKey.get(normalizeCardDescriptionKey(cardClass)) ?? {};
};

const resolveCharacterCardDescription = (cardClass: string): {
    atk1Description: string;
    atk2Description: string;
    abilityName: string;
    abilityDescription: string;
    flavorText: string;
} => {
    const entry = resolveCardPreviewDescriptionEntry(cardClass);
    return {
        atk1Description: readMultiLineField(entry.atk1Description, characterDefaultDescription.atk1Description),
        atk2Description: readMultiLineField(entry.atk2Description, characterDefaultDescription.atk2Description),
        abilityName: readSingleLineField(entry.abilityName, characterDefaultDescription.abilityName),
        abilityDescription: readMultiLineField(entry.abilityDescription, characterDefaultDescription.abilityDescription),
        flavorText: readMultiLineField(entry.flavorText, characterDefaultDescription.flavorText),
    };
};

const resolveOtherCardDescription = (cardClass: string): { abilityDescription: string } => {
    const entry = resolveCardPreviewDescriptionEntry(cardClass);
    return {
        abilityDescription: readMultiLineField(entry.abilityDescription, otherCardDefaultDescription.abilityDescription),
    };
};

const CHARACTER_TYPE_LABELS: Record<string, string> = {
    NONE: 'None',
    WW: 'Woodwind',
    PERC: 'Percussion',
    PIANO: 'Piano',
    STRING: 'String',
    GUITAR: 'Guitar',
    CHOIR: 'Choir',
    BRASS: 'Brass',
};

export class CardPreviewController
{
    private readonly scene: Scene;
    private panel: Phaser.GameObjects.Rectangle | null;
    private body: Phaser.GameObjects.Rectangle | null;
    private idText: Phaser.GameObjects.BitmapText | null;
    private typeText: Phaser.GameObjects.BitmapText | null;
    private hpText: Phaser.GameObjects.BitmapText | null;
    private paragraphText: Phaser.GameObjects.BitmapText | null;
    private flavorText: Phaser.GameObjects.Text | null;

    constructor (scene: Scene)
    {
        this.scene = scene;
        this.panel = null;
        this.body = null;
        this.idText = null;
        this.typeText = null;
        this.hpText = null;
        this.paragraphText = null;
        this.flavorText = null;
    }

    create (objectWidth: number, objectHeight: number, options?: { side?: 'left' | 'right' }): void
    {
        const panelWidth = Math.round((GAME_PREVIEW_LAYOUT.panelWidthBase / BASE_WIDTH) * GAME_WIDTH);
        const panelHeight = Math.round((GAME_PREVIEW_LAYOUT.panelHeightBase / BASE_HEIGHT) * GAME_HEIGHT);
        const sideMargin = Math.round((GAME_PREVIEW_LAYOUT.sideMarginBase / BASE_WIDTH) * GAME_WIDTH);
        const side = options?.side ?? 'right';

        const panelX = side === 'left'
            ? sideMargin + Math.round(panelWidth / 2)
            : GAME_WIDTH - sideMargin - Math.round(panelWidth / 2);
        const panelY = GAME_HEIGHT - sideMargin - Math.round(panelHeight / 2);
        const topY = panelY - Math.round(panelHeight / 2);

        const previewCardWidth = Math.round(objectWidth * GAME_PREVIEW_LAYOUT.cardWidthMultiplier);
        const previewCardHeight = Math.round(objectHeight * GAME_PREVIEW_LAYOUT.cardHeightMultiplier);
        const previewCardCenterY = topY + Math.round(panelHeight * GAME_PREVIEW_LAYOUT.cardCenterYRatio);

        this.panel = this.scene.add.rectangle(panelX, panelY, panelWidth, panelHeight, GAME_PREVIEW_LAYOUT.panelFillColor, GAME_PREVIEW_LAYOUT.panelFillAlpha)
            .setStrokeStyle(GAME_PREVIEW_LAYOUT.panelStrokeWidth, GAME_PREVIEW_LAYOUT.panelStrokeColor, GAME_PREVIEW_LAYOUT.panelStrokeAlpha)
            .setDepth(GAME_DEPTHS.previewPanel)
            .setVisible(false);

        this.body = this.scene.add.rectangle(panelX, previewCardCenterY, previewCardWidth, previewCardHeight, GAME_PREVIEW_LAYOUT.cardFillColor, GAME_PREVIEW_LAYOUT.cardFillAlpha)
            .setStrokeStyle(CARD_BORDER_WIDTH, GAME_PREVIEW_LAYOUT.panelStrokeColor, 1)
            .setDepth(GAME_DEPTHS.previewCard)
            .setVisible(false);

        this.idText = this.scene.add.bitmapText(
            panelX,
            previewCardCenterY - Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.idYOffsetRatio),
            'minogram',
            '',
            Math.max(GAME_PREVIEW_LAYOUT.idFontSizeMin, Math.round(GAME_PREVIEW_LAYOUT.idFontSize * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(GAME_PREVIEW_LAYOUT.panelStrokeColor)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.typeText = this.scene.add.bitmapText(
            panelX,
            previewCardCenterY + Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.typeYOffsetRatio),
            'minogram',
            '',
            Math.max(GAME_PREVIEW_LAYOUT.typeFontSizeMin, Math.round(GAME_PREVIEW_LAYOUT.typeFontSize * UI_SCALE))
        )
            .setOrigin(0.5)
            .setTint(GAME_PREVIEW_LAYOUT.typeTint)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.hpText = this.scene.add.bitmapText(
            panelX - Math.round(previewCardWidth / 2) + Math.round(previewCardWidth * GAME_PREVIEW_LAYOUT.hpOffsetXRatio),
            previewCardCenterY - Math.round(previewCardHeight / 2) + Math.round(previewCardHeight * GAME_PREVIEW_LAYOUT.hpOffsetYRatio),
            'minogram',
            '',
            Math.max(GAME_PREVIEW_LAYOUT.hpFontSizeMin, Math.round(GAME_PREVIEW_LAYOUT.hpFontSize * UI_SCALE))
        )
            .setOrigin(0, 0)
            .setTint(GAME_PREVIEW_LAYOUT.panelStrokeColor)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.paragraphText = this.scene.add.bitmapText(
            panelX,
            topY + Math.round(panelHeight * GAME_PREVIEW_LAYOUT.paragraphYRatio),
            'minogram',
            '',
            Math.max(GAME_PREVIEW_LAYOUT.paragraphFontSizeMin, Math.round(GAME_PREVIEW_LAYOUT.paragraphFontSize * UI_SCALE))
        )
            .setOrigin(0.5, 0)
            .setCenterAlign()
            .setTint(GAME_PREVIEW_LAYOUT.paragraphTint)
            .setMaxWidth(Math.round(panelWidth * GAME_PREVIEW_LAYOUT.paragraphWidthRatio))
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);

        this.flavorText = this.scene.add.text(
            panelX,
            this.paragraphText.y,
            '',
            {
                fontFamily: 'MinecraftRegular, serif',
                fontSize: `${Math.max(GAME_PREVIEW_LAYOUT.flavorFontSizeMin, Math.round((GAME_PREVIEW_LAYOUT.paragraphFontSize + GAME_PREVIEW_LAYOUT.flavorFontSizeDelta) * UI_SCALE))}px`,
                fontStyle: 'italic',
                color: '#e2e8f0',
                align: 'center',
                wordWrap: {
                    width: Math.round(panelWidth * GAME_PREVIEW_LAYOUT.paragraphWidthRatio),
                    useAdvancedWrap: true,
                },
            }
        )
            .setOrigin(0.5, 0)
            .setDepth(GAME_DEPTHS.previewText)
            .setVisible(false);
    }

    show (card: Card, options?: { ownerUsername?: string; forceFaceUp?: boolean }): void
    {
        if (!this.panel || !this.body || !this.idText || !this.typeText || !this.hpText || !this.paragraphText) {
            return;
        }

        const renderAsFaceDown = card.isTurnedOver() && options?.forceFaceUp !== true;
        const ownerUsername = readSingleLineField(options?.ownerUsername, card.getOwnerId().toUpperCase());

        this.panel.setVisible(true);
        this.body
            .setVisible(true)
            .setFillStyle(renderAsFaceDown ? CARD_VISUALS.faceDownFillColor : card.baseColor, 1)
            .setStrokeStyle(CARD_BORDER_WIDTH, card.getBorderColor(), 1);

        this.idText.setVisible(true).setText(card.getCardClass());
        this.idText.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.idText.text,
            preferredSize: this.idText.fontSize,
            minSize: Math.max(GAME_PREVIEW_LAYOUT.fitIdMinSize, Math.round(this.idText.fontSize * GAME_PREVIEW_LAYOUT.fitIdSizeRatio)),
            maxWidth: Math.max(GAME_PREVIEW_LAYOUT.fitIdWidthMin, Math.round(this.body.width * GAME_PREVIEW_LAYOUT.fitIdWidthRatio))
        }));
        const previewTypeText = card.getCardType() === 'character'
            ? (String(card.getAVGECardType() ?? '').trim().toUpperCase() || 'NONE')
            : card.getCardType().toUpperCase();
        this.typeText.setVisible(true).setText(previewTypeText);
        this.typeText.setFontSize(fitBitmapTextToSingleLine({
            scene: this.scene,
            font: 'minogram',
            text: this.typeText.text,
            preferredSize: this.typeText.fontSize,
            minSize: Math.max(GAME_PREVIEW_LAYOUT.fitTypeMinSize, Math.round(this.typeText.fontSize * GAME_PREVIEW_LAYOUT.fitTypeSizeRatio)),
            maxWidth: Math.max(GAME_PREVIEW_LAYOUT.fitTypeWidthMin, Math.round(this.body.width * GAME_PREVIEW_LAYOUT.fitTypeWidthRatio))
        }));

        if (card.getCardType() === 'character') {
            this.hpText.setVisible(true).setText(`[${card.getHp()}/${card.getMaxHp()}]`);
            this.hpText.setFontSize(fitBitmapTextToSingleLine({
                scene: this.scene,
                font: 'minogram',
                text: this.hpText.text,
                preferredSize: this.hpText.fontSize,
                minSize: Math.max(GAME_PREVIEW_LAYOUT.fitHpMinSize, Math.round(this.hpText.fontSize * GAME_PREVIEW_LAYOUT.fitHpSizeRatio)),
                maxWidth: Math.max(GAME_PREVIEW_LAYOUT.fitHpWidthMin, Math.round(this.body.width * GAME_PREVIEW_LAYOUT.fitHpWidthRatio))
            }));
        }
        else {
            this.hpText.setVisible(false);
        }

        const previewCopy = this.buildCardPreviewParagraph(card, ownerUsername);
        this.paragraphText
            .setVisible(true)
            .setText(previewCopy.mainText);

        if (this.flavorText) {
            const flavorTopGap = Math.max(GAME_PREVIEW_LAYOUT.flavorTopGapMin, Math.round(GAME_PREVIEW_LAYOUT.flavorTopGapBase * UI_SCALE));
            const hasFlavor = previewCopy.flavorText.trim().length > 0;
            this.flavorText
                .setVisible(hasFlavor)
                .setPosition(this.paragraphText.x, this.paragraphText.y + this.paragraphText.height + flavorTopGap)
                .setText(previewCopy.flavorText);
        }
    }

    private buildCardPreviewParagraph (card: Card, ownerUsername: string): { mainText: string; flavorText: string }
    {
        if (card.getCardType() !== 'character') {
            const otherCardDescription = resolveOtherCardDescription(card.getCardClass());
            return {
                mainText: [
                    `Owner: ${ownerUsername}`,
                    `${otherCardDescription.abilityDescription}`,
                ].join('\n\n'),
                flavorText: '',
            };
        }

        const characterDescription = resolveCharacterCardDescription(card.getCardClass());
        const headerLines = [
            `Owner: ${ownerUsername}, Type: ${this.formatCharacterType(card)}`,
            `Statuses: ${this.formatCharacterStatuses(card)}`,
            `Retreat Cost: ${card.getRetreatCost()}`,
        ];
        const sections: string[] = [headerLines.join('\n')];

        if (card.hasAttackOne()) {
            sections.push(this.formatNamedDescription(
                card.getAttackOneName() ?? 'Attack 1',
                characterDescription.atk1Description,
                card.getAttackOneCost()
            ));
        }

        if (card.hasAttackTwo()) {
            sections.push(this.formatNamedDescription(
                card.getAttackTwoName() ?? 'Attack 2',
                characterDescription.atk2Description,
                card.getAttackTwoCost()
            ));
        }

        if (card.hasActiveAbility() || card.hasPassiveAbility()) {
            const fallbackAbilityName = card.getActiveAbilityName()
                ?? (card.hasPassiveAbility() ? 'Passive Ability' : 'Ability');
            const abilityName = readSingleLineField(characterDescription.abilityName, fallbackAbilityName);
            sections.push(this.formatNamedDescription(abilityName, characterDescription.abilityDescription));
        }

        return {
            mainText: sections.join('\n\n'),
            flavorText: characterDescription.flavorText,
        };
    }

    private formatNamedDescription (name: string, description: string, energyCost?: number | null): string
    {
        const normalizedName = readSingleLineField(name, '').trim();
        const normalizedDescription = readMultiLineField(description, '').trim();

        if (!normalizedName) {
            return normalizedDescription;
        }

        if (!normalizedDescription) {
            return normalizedName;
        }

        const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const leadingNameRegex = new RegExp(`^${escapedName}(?:\\s*\\(\\s*(?:[Xx]+|\\d+)\\s*\\))?\\s*[:\u2013\-]?\\s*`, 'i');
        const strippedDescription = normalizedDescription.replace(leadingNameRegex, '').trim();
        const costSuffix = this.formatEnergyCostSuffix(energyCost);

        if (!strippedDescription) {
            return `${normalizedName}${costSuffix}`;
        }

        return `${normalizedName}${costSuffix}: ${strippedDescription}`;
    }

    private formatEnergyCostSuffix (energyCost?: number | null): string
    {
        if (!Number.isFinite(energyCost)) {
            return '';
        }

        const normalizedCost = Math.max(0, Math.round(energyCost as number));
        if (normalizedCost === 0) {
            return ' (0)';
        }

        if (normalizedCost <= 12) {
            return ` (${Array.from({ length: normalizedCost }, () => 'X').join('')})`;
        }

        return ` (${normalizedCost}X)`;
    }

    private formatTypeToken (rawToken: string): string
    {
        const token = rawToken.trim();
        if (!token) {
            return '';
        }

        const uppercaseToken = token.toUpperCase();
        if (CHARACTER_TYPE_LABELS[uppercaseToken]) {
            return CHARACTER_TYPE_LABELS[uppercaseToken];
        }

        if (uppercaseToken.length <= 3) {
            return uppercaseToken;
        }

        return `${uppercaseToken.slice(0, 1)}${uppercaseToken.slice(1).toLowerCase()}`;
    }

    private formatCharacterType (card: Card): string
    {
        const rawType = String(card.getAVGECardType() ?? '').trim();
        if (!rawType) {
            return 'None';
        }

        const tokens = rawType
            .split(/[\/|,]+/)
            .map((token) => this.formatTypeToken(token))
            .filter((token) => token.length > 0);

        if (tokens.length === 0) {
            return 'None';
        }

        return tokens.join('/');
    }

    private formatCharacterStatuses (card: Card): string
    {
        const statuses = card.getStatusEffects();
        const preferredOrder = ['Arranger', 'Goon', 'Maid'];
        const activeStatuses: string[] = [];
        const seen = new Set<string>();

        for (const key of preferredOrder) {
            const value = statuses[key] ?? 0;
            if (value > 0) {
                activeStatuses.push(key);
            }
            seen.add(key.toLowerCase());
        }

        for (const [key, value] of Object.entries(statuses)) {
            if (seen.has(key.toLowerCase())) {
                continue;
            }

            if (value > 0) {
                activeStatuses.push(key);
            }
        }

        return activeStatuses.length > 0 ? activeStatuses.join(', ') : 'NONE';
    }

    hide (): void
    {
        this.panel?.setVisible(false);
        this.body?.setVisible(false);
        this.idText?.setVisible(false);
        this.typeText?.setVisible(false);
        this.hpText?.setVisible(false);
        this.paragraphText?.setVisible(false);
        this.flavorText?.setVisible(false);
    }

    isVisible (): boolean
    {
        return this.panel?.visible ?? false;
    }

    containsPoint (x: number, y: number): boolean
    {
        if (!this.panel || !this.panel.visible) {
            return false;
        }

        const bounds = this.panel.getBounds();
        return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
    }
}
