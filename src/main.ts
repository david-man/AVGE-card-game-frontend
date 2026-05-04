import StartGame from './game/main';
import { installFontSizeFloor } from './game/ui/fontSizeFloor';

document.addEventListener('DOMContentLoaded', () => {
    installFontSizeFloor();

    void StartGame('game-container');

});