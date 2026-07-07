"""
Game progress API.

Endpoints (all under /api/games/):
  * GET    progress/            -> load this player's saved game state
  * PUT    progress/            -> save coins, purchased items, used letters
  * POST   sessions/            -> start a session
  * POST   sessions/<id>/finish/ -> close a session, award coins
  * POST   attempts/            -> record one puzzle attempt
  * GET    leaderboard/         -> top players by coins (cached)
"""

from django.core.cache import cache
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import PlayerProfile
from .models import GameSession, PuzzleAttempt, GameProgress
from .serializers import (
    GameSessionSerializer,
    PuzzleAttemptSerializer,
    GameProgressSerializer,
    LeaderboardEntrySerializer,
)

LEADERBOARD_CACHE_KEY = "leaderboard:top"
LEADERBOARD_CACHE_TTL = 30  # seconds

# Upper bound for a legitimate coin balance. The client is trusted to report
# its own coins, so clamp to a sane range to limit leaderboard tampering.
MAX_COINS = 1_000_000


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _profile(request):
    return PlayerProfile.objects.get(user=request.user)


class ProgressView(APIView):
    """Load and save the player's full game state."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        progress, _ = GameProgress.objects.get_or_create(player=_profile(request))
        return Response(GameProgressSerializer(progress).data)

    def put(self, request):
        profile = _profile(request)
        progress, _ = GameProgress.objects.get_or_create(player=profile)

        data = request.data
        if "coins" in data:
            progress.coins = min(max(_safe_int(data["coins"]), 0), MAX_COINS)
        if "purchased_items" in data:
            progress.purchased_items = list(data["purchased_items"])[:200]
        if "used_letters" in data:
            progress.used_letters = list(data["used_letters"])[:500]
        if "puzzles_solved" in data:
            progress.puzzles_solved = min(max(_safe_int(data["puzzles_solved"]), 0), MAX_COINS)
        if "settings" in data:
            progress.settings = data["settings"]
        progress.save()

        # Keep the player's headline coin total in sync for the leaderboard.
        profile.total_coins = max(progress.coins, 0)
        profile.save(update_fields=["total_coins"])
        cache.delete(LEADERBOARD_CACHE_KEY)

        return Response(GameProgressSerializer(progress).data)


class StartSessionView(generics.CreateAPIView):
    serializer_class = GameSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(player=_profile(self.request))


class FinishSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            session = GameSession.objects.get(pk=pk, player=_profile(request))
        except GameSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        coins = min(max(_safe_int(request.data.get("coins_earned", 0)), 0), MAX_COINS)
        previous_coins = session.coins_earned if session.completed else 0
        session.coins_earned = coins
        session.completed = True
        session.ended_at = timezone.now()
        session.save()

        profile = session.player
        profile.total_coins = max(profile.total_coins + coins - previous_coins, 0)
        profile.save(update_fields=["total_coins"])

        cache.delete(LEADERBOARD_CACHE_KEY)
        return Response(GameSessionSerializer(session).data)


class RecordAttemptView(generics.CreateAPIView):
    serializer_class = PuzzleAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        session_id = request.data.get("session")
        try:
            session = GameSession.objects.get(
                pk=session_id, player=_profile(request)
            )
        except GameSession.DoesNotExist:
            return Response(
                {"detail": "Session not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attempt = serializer.save(session=session)

        progress, _ = GameProgress.objects.get_or_create(player=session.player)
        if attempt.won:
            progress.puzzles_solved += 1
        progress.save()

        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LeaderboardView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = cache.get(LEADERBOARD_CACHE_KEY)
        if data is None:
            top = PlayerProfile.objects.order_by("-total_coins")[:10]
            rows = [
                {
                    "display_name": p.display_name,
                    "total_coins": p.total_coins,
                    "puzzles_solved": getattr(
                        getattr(p, "progress", None), "puzzles_solved", 0
                    ),
                }
                for p in top
            ]
            data = LeaderboardEntrySerializer(rows, many=True).data
            cache.set(LEADERBOARD_CACHE_KEY, data, LEADERBOARD_CACHE_TTL)
        return Response(data)
