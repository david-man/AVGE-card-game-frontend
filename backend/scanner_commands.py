from __future__ import annotations

import shlex
from typing import Any, Callable


def _split_command(raw_command: str) -> list[str]:
    try:
        return shlex.split(raw_command)
    except ValueError:
        return raw_command.strip().split()


def mv(args: list[str]) -> str:
    if len(args) < 2:
        raise ValueError('Usage: mv [cardid] [cardholderid] [index?]')

    card_id = args[0].upper()
    holder_id = args[1].lower()

    if len(args) >= 3:
        index = int(args[2])
        if index < 0:
            raise ValueError('mv index must be a non-negative integer')
        return f'mv {card_id} {holder_id} {index}'

    return f'mv {card_id} {holder_id}'


def rm(args: list[str]) -> str:
    if len(args) != 1:
        raise ValueError('Usage: rm [energyid]')
    return f'rm {int(args[0])}'


def phase(args: list[str]) -> str:
    if len(args) != 1:
        raise ValueError('Usage: phase [no-input|phase2|atk]')
    value = args[0].lower()
    if value not in {'no-input', 'phase2', 'atk'}:
        raise ValueError('phase must be one of: no-input, phase2, atk')
    return f'phase {value}'


def turn(args: list[str]) -> str:
    if len(args) != 1:
        raise ValueError('Usage: turn [player-1|player-2]')
    value = args[0].lower()
    if value not in {'player-1', 'player-2'}:
        raise ValueError('turn must be player-1 or player-2')
    return f'turn {value}'


def stat(args: list[str]) -> str:
    if len(args) != 3:
        raise ValueError('Usage: stat [player-1|player-2] [attribute] [value]')
    player = args[0].lower()
    if player not in {'player-1', 'player-2'}:
        raise ValueError('stat player must be player-1 or player-2')
    attribute = args[1]
    value = float(args[2])
    return f'stat {player} {attribute} {value:g}'


def flip(args: list[str]) -> str:
    if len(args) != 1:
        raise ValueError('Usage: flip [cardid]')
    return f'flip {args[0].upper()}'


def hp(args: list[str]) -> str:
    if len(args) != 3:
        raise ValueError('Usage: hp [cardid] [hp] [maxhp]')
    card_id = args[0].upper()
    hp_value = float(args[1])
    max_hp = float(args[2])
    return f'hp {card_id} {hp_value:g} {max_hp:g}'


def border(args: list[str]) -> str:
    if len(args) != 2:
        raise ValueError('Usage: border [cardid] [hex]')
    return f'border {args[0].upper()} {args[1]}'


def notify(args: list[str]) -> str:
    if len(args) < 2:
        raise ValueError('Usage: notify [player-1|player-2] [msg]')
    target = args[0].lower()
    if target not in {'player-1', 'player-2'}:
        raise ValueError('notify target must be player-1 or player-2')
    message = ' '.join(args[1:])
    return f'notify {target} {message}'


def reveal(args: list[str]) -> str:
    if len(args) < 2:
        raise ValueError('Usage: reveal [player-1|player-2] [list of cards]')
    target = args[0].lower()
    if target not in {'player-1', 'player-2'}:
        raise ValueError('reveal target must be player-1 or player-2')
    cards = ' '.join(args[1:])
    return f'reveal {target} {cards}'


def boom(args: list[str]) -> str:
    if len(args) < 1:
        raise ValueError('Usage: boom [cardid] [asset?]')
    if len(args) == 1:
        return f'boom {args[0].upper()}'
    tail = ' '.join(args[1:])
    return f'boom {args[0].upper()} {tail}'


def view(args: list[str]) -> str:
    if len(args) == 0:
        return 'view'
    if len(args) != 1:
        raise ValueError('Usage: view [admin|player-1|player-2]')
    value = args[0].lower()
    if value not in {'admin', 'player-1', 'player-2'}:
        raise ValueError('view must be admin, player-1, or player-2')
    return f'view {value}'


def help_command(args: list[str]) -> str:
    if args:
        raise ValueError('Usage: help')
    return 'help'


def attach_tool(args: list[str]) -> str:
    if len(args) != 2:
        raise ValueError('Usage: attach-tool [tool card id] [target character id]')
    return f'attach-tool {args[0].upper()} {args[1].upper()}'


def shuffle_animation(args: list[str]) -> str:
    if args:
        raise ValueError('Usage: shuffle-animation')
    return 'shuffle-animation'


def unselect_all(args: list[str]) -> str:
    if args:
        raise ValueError('Usage: unselect-all')
    return 'unselect-all'


def input_command(args: list[str]) -> str:
    if len(args) < 2:
        raise ValueError('Usage: input [type] [msg] [..args]')
    input_type = args[0].lower().replace('_', '-').replace(' ', '-')
    remainder = ' '.join(args[1:])
    return f'input {input_type} {remainder}'


COMMAND_HANDLERS: dict[str, Callable[[list[str]], str]] = {
    'help': help_command,
    '?': help_command,
    'mv': mv,
    'rm': rm,
    'phase': phase,
    'game-phase': phase,
    'turn': turn,
    'player-turn': turn,
    'stat': stat,
    'flip': flip,
    'hp': hp,
    'border': border,
    'input': input_command,
    'notify': notify,
    'reveal': reveal,
    'boom': boom,
    'view': view,
    'attach-tool': attach_tool,
    'attachtool': attach_tool,
    'shuffle-animation': shuffle_animation,
    'unselect-all': unselect_all,
    'unselectall': unselect_all,
}


def normalize_scanner_command(raw_command: str) -> tuple[str, str]:
    tokens = _split_command(raw_command)
    if not tokens:
        raise ValueError('Scanner command cannot be empty')

    action = tokens[0].lower()
    handler = COMMAND_HANDLERS.get(action)
    if handler is None:
        raise ValueError(f'Unknown scanner command: {action}')

    normalized = handler(tokens[1:])
    return action, normalized