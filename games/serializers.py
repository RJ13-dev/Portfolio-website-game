"""Serializers for game sessions, attempts, progress, and the leaderboard."""

from rest_framework import serializers

from .models import GameSession, PuzzleAttempt, GameProgress


class PuzzleAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = PuzzleAttempt
        fields = (
            "id",
            "puzzle_type",
            "puzzle_title",
            "won",
            "lives_remaining",
            "coins_awarded",
            "duration_seconds",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class GameSessionSerializer(serializers.ModelSerializer):
    attempts = PuzzleAttemptSerializer(many=True, read_only=True)

    class Meta:
        model = GameSession
        fields = (
            "id",
            "started_at",
            "ended_at",
            "coins_earned",
            "completed",
            "attempts",
        )
        read_only_fields = ("id", "started_at")


class GameProgressSerializer(serializers.ModelSerializer):
    """The full saved game-state: coins, purchases, and used letters."""

    display_name = serializers.CharField(
        source="player.display_name", read_only=True
    )

    class Meta:
        model = GameProgress
        fields = (
            "display_name",
            "coins",
            "purchased_items",
            "used_letters",
            "puzzles_solved",
            "best_streak",
            "last_played",
            "settings",
        )
        read_only_fields = ("display_name", "last_played")


class LeaderboardEntrySerializer(serializers.Serializer):
    """Read-only shape for a leaderboard row."""

    display_name = serializers.CharField()
    total_coins = serializers.IntegerField()
    puzzles_solved = serializers.IntegerField()
