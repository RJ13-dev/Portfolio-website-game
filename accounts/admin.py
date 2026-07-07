from django.contrib import admin

from .models import PlayerProfile


@admin.register(PlayerProfile)
class PlayerProfileAdmin(admin.ModelAdmin):
    list_display = ("display_name", "user", "total_coins", "created_at")
    search_fields = ("display_name", "user__username")
    ordering = ("-total_coins",)
