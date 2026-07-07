"""
Account models.

A PlayerProfile extends Django's built-in User with the persistent
player-facing state that the Stimulus game needs: a display name and a
running coin balance (the game awards coins on puzzle wins).
"""

from django.contrib.auth.models import User
from django.db import models


class PlayerProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="profile"
    )
    display_name = models.CharField(max_length=50)
    total_coins = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-total_coins"]

    def __str__(self):
        return f"{self.display_name} ({self.total_coins} coins)"
