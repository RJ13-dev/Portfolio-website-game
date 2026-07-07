from django.contrib import admin

from .models import GameSession, PuzzleAttempt, GameProgress


class PuzzleAttemptInline(admin.TabularInline):
    model = PuzzleAttempt
    extra = 0


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "player", "coins_earned", "completed", "started_at")
    list_filter = ("completed",)
    inlines = [PuzzleAttemptInline]


@admin.register(PuzzleAttempt)
class PuzzleAttemptAdmin(admin.ModelAdmin):
    list_display = ("puzzle_type", "won", "coins_awarded", "created_at")
    list_filter = ("puzzle_type", "won")


@admin.register(GameProgress)
class GameProgressAdmin(admin.ModelAdmin):
    list_display = ("player", "puzzles_solved", "best_streak", "last_played")
