import { Game as MainGame } from './scenes/Game';
import { DeckBuilder } from './scenes/DeckBuilder';
import { Login } from './scenes/Login';
import { MainMenu } from './scenes/MainMenu';
import { AUTO, Game } from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';

// Modern Phaser resolution control: zoom scales the internal render resolution.
const RESOLUTION_ZOOM = Math.min(window.devicePixelRatio || 1, 2);

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    backgroundColor: '#028af8',
    scale: {
        mode: Phaser.Scale.ENVELOP,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        zoom: RESOLUTION_ZOOM
    },
    scene: [
        Login,
        DeckBuilder,
        MainMenu,
        MainGame
    ],
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
