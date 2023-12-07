#!/usr/bin/env python3
# (C) Quantag
# Author: A.K.
#
# Json requests handling server
#
# Run following to get help for input arguments:
# ./pserver.py --help
# usage: pserver.py [-h] [-iport IPORT] [-oport OPORT] [-lhost LHOST] [-rhost RHOST]

import os
import sys
import argparse
import asyncio
import websockets
import json
import base64
import logging
import time

async def handle_message(message, websocket):
    try:
        data = json.loads(message)

        if 'action' in data:
            action = data['action']

            if action == 'echo':
                response = {'message': 'echo', 'data': data.get('data', '')}
                await websocket.send(json.dumps(response))

            elif action == 'file_transfer':
                if 'file_data' in data:
                    file_data = data['file_data']
                    file_name = data.get('file_name', 'received_file.txt')

                    # Decode base64 and save the file
                    file_content = base64.b64decode(file_data)
                    with open(file_name, 'wb') as file:
                        file.write(file_content)

                    response = {'message': 'file_received', 'file_name': file_name}
                    await websocket.send(json.dumps(response))

    except json.JSONDecodeError:
        logging.error("Invalid JSON format.")

async def server(websocket, path):
    logging.info(f"Client connected from {websocket.remote_address}")
    try:
        async for message in websocket:
            await handle_message(message, websocket)
    except websockets.ConnectionClosedError:
        logging.info(f"Connection closed by {websocket.remote_address}")


def main(iPort: int, oPort:int, Lhost: str, Rhost: str):
    logging.basicConfig(
        filename='pserver.log',
        format='%(asctime)s %(message)s',
        encoding='utf-8', level=logging.DEBUG
    )

    start_server = websockets.serve(server, Lhost, iPort)

    asyncio.get_event_loop().run_until_complete(start_server)
    asyncio.get_event_loop().run_forever()


if __name__ == "__main__":
    # Input
    parser = argparse.ArgumentParser(description='JSON server')
    parser.add_argument('-iport', type=int, help='Input local port/socket where connectaions are expected.', default=5555, required=False)
    parser.add_argument('-oport', type=int, help='Output remote port/socket where data will be sent', default=5556, required=False)
    parser.add_argument('-lhost', type=str, help='Local IP for incoming connections, default localhost', default='localhost', required=False)
    parser.add_argument('-rhost', type=str, help='Remote IP for incoming connections, default localhost', default='localhost', required=False)
    args = parser.parse_args()
    main(args.iport, args.oport, args.lhost, args.rhost)