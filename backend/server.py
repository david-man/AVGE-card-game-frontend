from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Condition
from typing import Any

from flask import Flask, request

from scanner_commands import normalize_scanner_command

app = Flask(__name__)
scanner_command_queue: deque[dict[str, Any]] = deque(maxlen=1024)
scanner_command_condition = Condition()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS, GET'
    return response


@app.get('/health')
def health() -> tuple[dict[str, str], int]:
    return {'status': 'ok', 'timestamp': _utc_now_iso()}, 200


@app.route('/events', methods=['POST', 'OPTIONS'])
def events() -> tuple[dict[str, Any], int]:
    if request.method == 'OPTIONS':
        return {'ok': True}, 204

    payload = request.get_json(silent=True) or {}

    event_type = payload.get('event_type', 'unknown')
    response_data = payload.get('response_data', {})
    context = payload.get('context', {})
    timestamp = payload.get('timestamp', _utc_now_iso())

    print('\n[EVENT] ----------------------------------------')
    print(f'timestamp: {timestamp}')
    print(f'event_type: {event_type}')
    print(f'context: {context}')
    print(f'response_data: {response_data}')
    print('[EVENT END] ------------------------------------\n')

    return {'ok': True, 'received_at': _utc_now_iso()}, 200


@app.route('/scanner/input', methods=['POST', 'OPTIONS'])
def scanner_input() -> tuple[dict[str, Any], int]:
    if request.method == 'OPTIONS':
        return {'ok': True}, 204

    payload = request.get_json(silent=True)
    source = 'scanner'

    if isinstance(payload, dict):
        raw_command = payload.get('command') or payload.get('scan') or payload.get('raw')
        if isinstance(payload.get('source'), str) and payload.get('source'):
            source = payload.get('source')
    else:
        raw_command = request.get_data(as_text=True)

    if not isinstance(raw_command, str) or raw_command.strip() == '':
        return {
            'ok': False,
            'error': 'Missing scanner command. Send JSON with "command" or plain text body.'
        }, 400

    try:
        action, normalized = normalize_scanner_command(raw_command)
    except ValueError as error:
        return {'ok': False, 'error': str(error)}, 400

    queue_item = {
        'action': action,
        'command': normalized,
        'source': source,
        'received_at': _utc_now_iso(),
    }
    with scanner_command_condition:
        scanner_command_queue.append(queue_item)
        scanner_command_condition.notify()

    print('\n[SCANNER] --------------------------------------')
    print(f'source: {source}')
    print(f'raw: {raw_command}')
    print(f'normalized: {normalized}')
    print(f'pending_queue_size: {len(scanner_command_queue)}')
    print('[SCANNER END] ----------------------------------\n')

    return {
        'ok': True,
        'queued': True,
        'pending_queue_size': len(scanner_command_queue),
        'action': action,
        'command': normalized,
    }, 200


@app.get('/scanner/next')
def scanner_next() -> tuple[dict[str, Any], int]:
    with scanner_command_condition:
        if len(scanner_command_queue) == 0:
            return {'ok': True, 'command': None, 'pending_queue_size': 0}, 200

        command_item = scanner_command_queue.popleft()

    return {
        'ok': True,
        'command': command_item.get('command'),
        'action': command_item.get('action'),
        'source': command_item.get('source', 'scanner'),
        'received_at': command_item.get('received_at'),
        'pending_queue_size': len(scanner_command_queue),
    }, 200


@app.get('/scanner/wait')
def scanner_wait() -> tuple[dict[str, Any], int]:
    raw_timeout = request.args.get('timeout_s', default='25')
    try:
        timeout_s = float(raw_timeout)
    except ValueError:
        timeout_s = 25.0

    timeout_s = max(1.0, min(60.0, timeout_s))

    with scanner_command_condition:
        if len(scanner_command_queue) == 0:
            scanner_command_condition.wait(timeout=timeout_s)

        if len(scanner_command_queue) == 0:
            return {
                'ok': True,
                'command': None,
                'pending_queue_size': 0,
                'timed_out': True,
            }, 200

        command_item = scanner_command_queue.popleft()
        return {
            'ok': True,
            'command': command_item.get('command'),
            'action': command_item.get('action'),
            'source': command_item.get('source', 'scanner'),
            'received_at': command_item.get('received_at'),
            'pending_queue_size': len(scanner_command_queue),
        }, 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5500, debug=True)
