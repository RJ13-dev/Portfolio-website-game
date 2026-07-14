"""Serializers for account registration and profile data."""

from django.contrib.auth.models import User
from rest_framework import serializers

from .models import PlayerProfile


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(max_length=50, write_only=True)

    class Meta:
        model = User
        fields = ("username", "password", "display_name")

    def validate_display_name(self, value):
        # The display name shows up on the public leaderboard, so keep markup
        # out of it. Belt and braces on top of the client rendering with
        # textContent.
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Display name can't be blank.")
        if any(ch in value for ch in "<>&\"'"):
            raise serializers.ValidationError(
                "Display name can't contain < > & \" or '."
            )
        return value

    def create(self, validated_data):
        display_name = validated_data.pop("display_name")
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )
        PlayerProfile.objects.create(user=user, display_name=display_name)
        return user


class PlayerProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = PlayerProfile
        fields = ("username", "display_name", "total_coins", "created_at")
        read_only_fields = ("total_coins", "created_at")
