"""Convenience launcher for the Maia3 localhost bridge.

Usage:
    python bridge_server.py --model maia3-5m --elo 1400
"""

from maia3.bridge_server import main


if __name__ == "__main__":
    main()
