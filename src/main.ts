import StartGame from './game/main';
import { installFontSizeFloor } from './game/ui/fontSizeFloor';

document.addEventListener('DOMContentLoaded', () => {
    installFontSizeFloor();

    StartGame('game-container');

});