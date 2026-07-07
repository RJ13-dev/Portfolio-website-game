from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="GameSession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("coins_earned", models.PositiveIntegerField(default=0)),
                ("completed", models.BooleanField(default=False)),
                ("player", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sessions", to="accounts.playerprofile")),
            ],
            options={"ordering": ["-started_at"]},
        ),
        migrations.CreateModel(
            name="GameProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("coins", models.IntegerField(default=200)),
                ("purchased_items", models.JSONField(blank=True, default=list)),
                ("used_letters", models.JSONField(blank=True, default=list)),
                ("puzzles_solved", models.PositiveIntegerField(default=0)),
                ("best_streak", models.PositiveIntegerField(default=0)),
                ("last_played", models.DateTimeField(auto_now=True)),
                ("settings", models.JSONField(blank=True, default=dict)),
                ("player", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="progress", to="accounts.playerprofile")),
            ],
        ),
        migrations.CreateModel(
            name="PuzzleAttempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("puzzle_type", models.CharField(choices=[("logic", "Logic grid"), ("sequence", "Sequence"), ("wordfill", "Word fill")], max_length=20)),
                ("puzzle_title", models.CharField(blank=True, max_length=120)),
                ("won", models.BooleanField(default=False)),
                ("lives_remaining", models.PositiveSmallIntegerField(default=0)),
                ("coins_awarded", models.PositiveIntegerField(default=0)),
                ("duration_seconds", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attempts", to="games.gamesession")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
