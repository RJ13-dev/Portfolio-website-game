"""Game progress API routes (mounted at /api/games/)."""

from django.urls import path

from .views import (
    ProgressView,
    StartSessionView,
    FinishSessionView,
    RecordAttemptView,
    LeaderboardView,
)

urlpatterns = [
    path("progress/", ProgressView.as_view(), name="progress"),
    path("sessions/", StartSessionView.as_view(), name="start-session"),
    path("sessions/<int:pk>/finish/", FinishSessionView.as_view(), name="finish-session"),
    path("attempts/", RecordAttemptView.as_view(), name="record-attempt"),
    path("leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
]
