import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def check():
    async with AsyncSessionLocal() as session:
        # Check all projects
        p = await session.execute(text("SELECT id, name, learning_goal FROM projects"))
        projects = p.fetchall()
        print("--- PROJECTS ---")
        for proj in projects:
            print(f"Project ID: {proj[0]} | Name: {proj[1]} | Goal: {proj[2]}")

        # Check all materials per project
        m = await session.execute(text("SELECT id, project_id, filename FROM materials"))
        print("\n--- MATERIALS ---")
        for mat in m.fetchall():
            print(f"Material: {mat[2]} | Project ID: {mat[1]}")

        # Check all tutor conversations
        s = await session.execute(text("SELECT id, project_id, title FROM tutor_conversations"))
        print("\n--- TUTOR CONVERSATIONS ---")
        for ses in s.fetchall():
            print(f"Conversation: {ses[0]} | Project ID: {ses[1]} | Title: {ses[2]}")

        # Check flashcards columns
        cols = await session.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'flashcards'"))
        print("\n--- FLASHCARD COLUMNS ---")
        print([r[0] for r in cols.fetchall()])

        # Check flashcards
        f = await session.execute(text("SELECT id, project_id, front FROM flashcards"))
        print("\n--- FLASHCARDS ---")
        for fc in f.fetchall():
            print(f"Card ID: {fc[0]} | Project ID: {fc[1]} | Front: {fc[2]}")

if __name__ == "__main__":
    asyncio.run(check())
