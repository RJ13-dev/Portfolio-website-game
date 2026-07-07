"""Tests for account registration, profile, and JWT login."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import PlayerProfile
from core.factories import PlayerProfileFactory

pytestmark = pytest.mark.django_db


def test_register_creates_user_and_profile():
    client = APIClient()
    resp = client.post(
        reverse("register"),
        {
            "username": "newbie",
            "password": "strongpass123",
            "display_name": "Newbie",
        },
        format="json",
    )
    assert resp.status_code == 201
    assert PlayerProfile.objects.filter(display_name="Newbie").exists()


def test_login_returns_jwt_tokens():
    profile = PlayerProfileFactory()
    profile.user.set_password("strongpass123")
    profile.user.save()

    client = APIClient()
    resp = client.post(
        reverse("token_obtain_pair"),
        {"username": profile.user.username, "password": "strongpass123"},
        format="json",
    )
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


def test_me_requires_auth():
    client = APIClient()
    assert client.get(reverse("me")).status_code == 401
