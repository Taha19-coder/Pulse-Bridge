"""Tests for the blink-sequence encoder (Morse-style communication)."""

import pytest

from backend.modules.eye_comm.encoder import BlinkEncoder, MORSE_REVERSE_TABLE


def test_short_blink_is_dot():
    enc = BlinkEncoder(short_max_ms=450.0, long_min_ms=450.0)
    symbols = enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000.0)
    assert len(symbols) == 1
    assert symbols[0].kind == "dot"
    assert symbols[0].value == "."


def test_long_blink_is_dash():
    enc = BlinkEncoder(short_max_ms=450.0, long_min_ms=450.0)
    symbols = enc.process_blink_complete(duration_ms=600.0, timestamp_ms=1000.0)
    assert len(symbols) == 1
    assert symbols[0].kind == "dash"
    assert symbols[0].value == "-"


def test_morse_letter_e():
    """E = . (one short blink)"""
    enc = BlinkEncoder()
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000.0)
    symbols = enc.process_letter_gap(timestamp_ms=2000.0)
    assert len(symbols) == 1
    assert symbols[0].value == "E"
    assert enc.get_composed_text() == "E"


def test_morse_letter_t():
    """T = - (one long blink)"""
    enc = BlinkEncoder()
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=1000.0)
    symbols = enc.process_letter_gap(timestamp_ms=2000.0)
    assert symbols[0].value == "T"
    assert enc.get_composed_text() == "T"


def test_morse_letter_s():
    """S = ... (three short blinks)"""
    enc = BlinkEncoder()
    for i in range(3):
        enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000 + i * 400)
    symbols = enc.process_letter_gap(timestamp_ms=2500.0)
    assert symbols[0].value == "S"
    assert enc.get_composed_text() == "S"


def test_morse_word_hello():
    """HELLO = .... . .-.. .-.. ---"""
    enc = BlinkEncoder()
    t = 1000

    # H = .... (blinks spaced 300ms apart, > rapid threshold of 200ms)
    for _ in range(4):
        enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
        t += 300
    enc.process_letter_gap(timestamp_ms=t + 400)
    t += 700

    # E = .
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_letter_gap(timestamp_ms=t + 400)
    t += 700

    # L = .-..
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_letter_gap(timestamp_ms=t + 400)
    t += 700

    # L = .-..
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=t)
    t += 300
    enc.process_letter_gap(timestamp_ms=t + 400)
    t += 700

    # O = ---
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=t)
    t += 300
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=t)
    t += 300
    enc.process_letter_gap(timestamp_ms=t + 400)  # finalize O into current_word
    enc.process_word_gap(timestamp_ms=t + 700)    # add word space

    assert enc.get_composed_text() == "HELLO"


def test_word_gap_adds_space():
    enc = BlinkEncoder()
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000.0)  # E
    enc.process_letter_gap(timestamp_ms=2000.0)
    enc.process_word_gap(timestamp_ms=5000.0)  # gap > word_gap_ms -> space
    enc.process_blink_complete(duration_ms=600.0, timestamp_ms=8000.0)  # T
    enc.process_letter_gap(timestamp_ms=9000.0)
    assert enc.get_composed_text() == "E T"


def test_three_rapid_blinks_clear_word():
    enc = BlinkEncoder()
    # 3 rapid blinks within 200ms each, then a non-rapid gap ends the sequence -> clear
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000.0)
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1100.0)  # rapid
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1200.0)  # rapid
    # Non-rapid blink ends the sequence (gap > 200ms) -> triggers clear
    syms = enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1500.0)
    assert any(s.value == "clear" for s in syms)
    assert enc.get_current_word() == ""


def test_five_rapid_blinks_speak():
    enc = BlinkEncoder()
    # 5 rapid blinks within 100ms each -> on the 5th blink, speak triggers
    syms = None
    for i in range(5):
        syms = enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000 + i * 100)
    assert any(s.value == "speak" for s in syms)


def test_encoder_reset():
    enc = BlinkEncoder()
    enc.process_blink_complete(duration_ms=200.0, timestamp_ms=1000.0)
    enc.process_letter_gap(timestamp_ms=2000.0)
    assert enc.get_composed_text() == "E"
    enc.reset()
    assert enc.get_composed_text() == ""
    assert enc.get_current_word() == ""
    assert enc.get_current_letter_morse() == ""


def test_unknown_morse_pattern():
    enc = BlinkEncoder()
    enc.state.current_letter = "......."  # 7 dots = not a valid letter
    symbols = enc.process_letter_gap(timestamp_ms=2000.0)
    assert symbols[0].value == "?"


def test_morse_reverse_table_covers_alphabet():
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        morse = None
        for char, pattern in __import__("backend.modules.eye_comm.encoder", fromlist=["MORSE_CODE_TABLE"]).MORSE_CODE_TABLE.items():
            if char == letter:
                morse = pattern
                break
        assert morse is not None
        assert MORSE_REVERSE_TABLE[morse] == letter
