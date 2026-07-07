"""Shared test factories."""

import factory
from django.contrib.auth.models import User

from accounts.models import PlayerProfile


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"player{n}")


class PlayerProfileFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = PlayerProfile

    user = factory.SubFactory(UserFactory)
    display_name = factory.Sequence(lambda n: f"Player {n}")
    total_coins = 0
