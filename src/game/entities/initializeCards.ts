import { Scene } from 'phaser';

import { Card, CardOptions } from './Card';

export function initializeCards (scene: Scene, cardOptions: CardOptions[]): Card[]
{
    return cardOptions.map((options) => new Card(scene, options));
}
