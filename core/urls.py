"""Page routes for the portfolio and game."""

from django.urls import path

from . import views

urlpatterns = [
    path("", views.portfolio, name="portfolio"),
    path("play/game/", views.game, name="game"),
]
