"""Blink-sequence encoder: turns blink events into composed text.

Implements a Morse-style blink language:
    Short blink (~0.1-0.45s)  -> dot (.)
    Long blink  (~0.45-2.0s)  -> dash (-)
    Gap ~0.7s between blinks  -> end of letter
    Gap ~2.5s+ between blinks -> end of word (space)

Also supports simple commands:
    1 short blink  -> "yes" / select
    2 short blinks -> "no" / back
    3 rapid blinks -> clear current word
    5 rapid blinks -> speak/copy composed text

Not a medical device — see docs/EYE_COMMUNICATION_PLAN.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# International Morse code (letters A-Z, digits 0-9, and a few punctuation).
MORSE_CODE_TABLE: dict[str, str] = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.",
    "G": "--.", "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..",
    "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
    "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
    "Y": "-.--", "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
    "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
    ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
    '"': ".-..-.", "$": "...-..-", "@": ".--.-.",
}

# Reverse lookup: morse pattern -> character.
MORSE_REVERSE_TABLE: dict[str, str] = {v: k for k, v in MORSE_CODE_TABLE.items()}

# Timing thresholds (milliseconds).
LETTER_GAP_MS = 700      # gap between blinks within a letter
WORD_GAP_MS = 2500       # gap between letters -> space
RAPID_BLINK_MAX_INTERVAL_MS = 200  # max gap between blinks to count as "rapid" (command)


@dataclass
class BlinkSymbol:
    """A single decoded blink symbol."""

    kind: str  # "dot" | "dash" | "space" | "command"
    value: str  # "." | "-" | " " | "yes" | "no" | "clear" | "speak"
    timestamp_ms: float


@dataclass
class CompositionState:
    """Mutable state of the text composition session."""

    current_letter: str = ""       # accumulated morse for the current letter
    current_word: str = ""         # decoded letters of the current word
    composed_text: str = ""        # full composed text
    last_blink_ms: Optional[float] = None
    rapid_sequence_len: int = 0    # length of current rapid-blink sequence
    last_rapid_blink_ms: Optional[float] = None


class BlinkEncoder:
    """Converts blink events into composed text using Morse-style encoding."""

    def __init__(
        self,
        short_max_ms: float = 450.0,
        long_min_ms: float = 450.0,
        letter_gap_ms: float = LETTER_GAP_MS,
        word_gap_ms: float = WORD_GAP_MS,
        rapid_blink_max_interval_ms: float = RAPID_BLINK_MAX_INTERVAL_MS,
        morse_table: Optional[dict[str, str]] = None,
    ):
        self.short_max_ms = short_max_ms
        self.long_min_ms = long_min_ms
        self.letter_gap_ms = letter_gap_ms
        self.word_gap_ms = word_gap_ms
        self.rapid_blink_max_interval_ms = rapid_blink_max_interval_ms
        self._morse_table = morse_table or MORSE_CODE_TABLE
        self._reverse_table = {v: k for k, v in self._morse_table.items()}
        self.state = CompositionState()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process_blink_complete(self, duration_ms: float, timestamp_ms: float) -> list:
        """Handle a completed blink (eyes opened after being closed).

        Returns a list of symbols emitted as a result (dot, dash, space, command).
        """
        symbols = []

        # Classify the blink.
        if duration_ms < self.short_max_ms:
            symbol_kind = "dot"
            symbol_value = "."
        elif duration_ms >= self.long_min_ms:
            symbol_kind = "dash"
            symbol_value = "-"
        else:
            # In the ambiguous middle zone, treat as dot (safer default).
            symbol_kind = "dot"
            symbol_value = "."

        # Track rapid-blink sequences for command detection.
        # Morse code blinks within a letter are typically spaced >200ms apart,
        # so they won't be counted as part of a rapid sequence.
        if self._is_rapid_blink(timestamp_ms):
            self.state.rapid_sequence_len += 1
        else:
            # Rapid sequence ended: check if it was a command.
            cmd = self._finalize_rapid_sequence()
            if cmd:
                symbols.append(cmd)
            self.state.rapid_sequence_len = 1  # this blink starts a new potential sequence
        self.state.last_rapid_blink_ms = timestamp_ms

        # Check if current rapid sequence length triggers a command.
        if self.state.rapid_sequence_len >= 5:
            symbols.append(BlinkSymbol(kind="command", value="speak", timestamp_ms=timestamp_ms))
            self.state.rapid_sequence_len = 0
            self.state.current_letter = ""
            self.state.current_word = ""
            self.state.last_blink_ms = timestamp_ms
            return symbols

        # Append dot/dash to current letter.
        self.state.current_letter += symbol_value
        symbols.append(BlinkSymbol(kind=symbol_kind, value=symbol_value, timestamp_ms=timestamp_ms))
        self.state.last_blink_ms = timestamp_ms

        return symbols

    def _finalize_rapid_sequence(self):
        """Called when a rapid sequence ends (next blink is not rapid).

        Returns a command symbol if the sequence length was 3 (clear),
        or None otherwise.
        """
        if self.state.rapid_sequence_len == 3:
            self.state.current_letter = ""
            self.state.current_word = ""
            return BlinkSymbol(
                kind="command",
                value="clear",
                timestamp_ms=self.state.last_rapid_blink_ms or 0,
            )
        return None

    def process_letter_gap(self, timestamp_ms: float) -> list:
        """Call when the gap since the last blink exceeds the letter-gap threshold.

        Finalizes the current letter into a character and appends it to the word.
        """
        symbols = []

        # Finalize any pending rapid sequence before processing letter gap.
        cmd = self._finalize_rapid_sequence()
        if cmd:
            symbols.append(cmd)
        self.state.rapid_sequence_len = 0

        if self.state.current_letter:
            char = self._reverse_table.get(self.state.current_letter, "?")
            self.state.current_word += char
            symbols.append(
                BlinkSymbol(kind="letter", value=char, timestamp_ms=timestamp_ms)
            )
            self.state.current_letter = ""

        self.state.last_blink_ms = timestamp_ms
        return symbols

    def process_word_gap(self, timestamp_ms: float) -> list:
        """Call when the gap since the last blink/letter exceeds the word-gap threshold.

        Finalizes the current word and appends a space to composed text.
        """
        symbols = []

        # Finalize any pending rapid sequence.
        cmd = self._finalize_rapid_sequence()
        if cmd:
            symbols.append(cmd)
        self.state.rapid_sequence_len = 0

        if self.state.current_word:
            self.state.composed_text += self.state.current_word + " "
            symbols.append(
                BlinkSymbol(kind="word", value=self.state.current_word, timestamp_ms=timestamp_ms)
            )
            self.state.current_word = ""
        elif not self.state.composed_text.endswith(" ") and self.state.composed_text:
            # Avoid double spaces if no word was pending but text exists.
            self.state.composed_text += " "

        self.state.last_blink_ms = timestamp_ms
        return symbols

    def get_composed_text(self) -> str:
        """Return the currently composed text (including the in-progress word)."""
        in_progress = self.state.current_word
        if self.state.current_letter:
            in_progress += self._reverse_table.get(self.state.current_letter, "?")
        return (self.state.composed_text + in_progress).strip()

    def get_current_letter_morse(self) -> str:
        return self.state.current_letter

    def get_current_word(self) -> str:
        return self.state.current_word

    def reset(self) -> None:
        self.state = CompositionState()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _is_rapid_blink(self, timestamp_ms: float) -> bool:
        if self.state.last_rapid_blink_ms is None:
            return False
        return (timestamp_ms - self.state.last_rapid_blink_ms) <= self.rapid_blink_max_interval_ms

    def should_emit_letter_gap(self, timestamp_ms: float) -> bool:
        if self.state.last_blink_ms is None:
            return False
        if not self.state.current_letter:
            return False
        return (timestamp_ms - self.state.last_blink_ms) >= self.letter_gap_ms

    def should_emit_word_gap(self, timestamp_ms: float) -> bool:
        if self.state.last_blink_ms is None:
            return False
        return (timestamp_ms - self.state.last_blink_ms) >= self.word_gap_ms
