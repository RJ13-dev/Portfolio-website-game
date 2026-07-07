"""Tests for the game progress API."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from core.factories import PlayerProfileFactory
from games.models import GameSession, PuzzleAttempt

pytestmark = pytest.mark.django_db


def auth_client(profile):
    client = APIClient()
    client.force_authenticate(user=profile.user)
    return client


def test_start_session():
    profile = PlayerProfileFactory()
    client = auth_client(profile)
    resp = client.post(reverse("start-session"), {}, format="json")
    assert resp.status_code == 201
    assert GameSession.objects.filter(player=profile).exists()


def test_record_attempt_updates_progress():
    profile = PlayerProfileFactory()
    client = auth_client(profile)
    session = GameSession.objects.create(player=profile)

    resp = client.post(
        reverse("record-attempt"),
        {
            "session": session.id,
            "puzzle_type": "logic",
            "puzzle_title": "The boarding house",
            "won": True,
            "lives_remaining": 2,
            "coins_awarded": 10,
            "duration_seconds": 95,
        },
        format="json",
    )
    assert resp.status_code == 201
    assert PuzzleAttempt.objects.filter(session=session, won=True).count() == 1
    assert profile.progress.puzzles_solved == 1


def test_finish_session_awards_coins():
    profile = PlayerProfileFactory()
    client = auth_client(profile)
    session = GameSession.objects.create(player=profile)

    resp = client.post(
        reverse("finish-session", args=[session.id]),
        {"coins_earned": 25},
        format="json",
    )
    assert resp.status_code == 200
    profile.refresh_from_db()
    assert profile.total_coins == 25


def test_leaderboard_is_public_and_ordered():
    PlayerProfileFactory(display_name="Low", total_coins=5)
    PlayerProfileFactory(display_name="High", total_coins=100)

    resp = APIClient().get(reverse("leaderboard"))
    assert resp.status_code == 200
    assert resp.data[0]["display_name"] == "High"
