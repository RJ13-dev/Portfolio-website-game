"""
Game progress models.

These mirror the mechanics that exist in the Stimulus game client (index.html):

  * The game has a coin economy: Game.coins starts at 200, award()/spend()
    adjust it, the shop deducts coins on purchase.
  * Game.roomItems is the list of shop item keys the player has bought.
  * Letters are consumed from Game.unused as the player plays them; the set of
    seen letter ids is the "letters used".
  * Each puzzle (logic grid / sequence) starts with MAX_LIVES and awards coins
    on a win.

The backend persists the player-facing state so progress survives across
sessions: coins, purchased items, and used letters together form the saved
game progress, plus a per-puzzle history for a leaderboard.
"""

from django.db import models

from accounts.models import PlayerProfile


class PuzzleType(models.TextChoices):
    LOGIC = "logic", "Logic grid"
    SEQUENCE = "sequence", "Sequence"
    WORDFILL = "wordfill", "Word fill"


class GameSession(models.Model):
    """One run of the game (one pass through Eve's letters)."""

    player = models.ForeignKey(
        PlayerProfile, on_delete=models.CASCADE, related_name="sessions"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    coins_earned = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"Session #{self.pk} · {self.player.display_name}"


class PuzzleAttempt(models.Model):
    """A single puzzle played within a session."""

    session = models.ForeignKey(
        GameSession, on_delete=models.CASCADE, related_name="attempts"
    )
    puzzle_type = models.CharField(max_length=20, choices=PuzzleType.choices)
    puzzle_title = models.CharField(max_length=120, blank=True)
    won = models.BooleanField(default=False)
    lives_remaining = models.PositiveSmallIntegerField(default=0)
    coins_awarded = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        outcome = "won" if self.won else "lost"
        return f"{self.get_puzzle_type_display()} · {outcome}"


class GameProgress(models.Model):
    """
    Persistent per-player progress snapshot — one row per player.

    This is the single source of truth the Stimulus client loads on login and
    saves to from the lobby. It holds exactly the three things requested:
    coins, the items the player has bought, and the letters they have used.
    """

    player = models.OneToOneField(
        PlayerProfile, on_delete=models.CASCADE, related_name="progress"
    )
    coins = models.IntegerField(default=200)
    purchased_items = models.JSONField(default=list, blank=True)
    used_letters = models.JSONField(default=list, blank=True)
    puzzles_solved = models.PositiveIntegerField(default=0)
    best_streak = models.PositiveIntegerField(default=0)
    last_played = models.DateTimeField(auto_now=True)
    settings = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Progress · {self.player.display_name} · {self.coins} coins"
