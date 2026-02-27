import { MigrationInterface, QueryRunner } from "typeorm";

export class InitStudentClassroom1772217393997 implements MigrationInterface {
    name = 'InitStudentClassroom1772217393997'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."students_profile_enum" AS ENUM('ADHD', 'Autistic', 'Typical')`);
        await queryRunner.query(`CREATE TABLE "students" ("id" SERIAL NOT NULL, "name" character varying(120) NOT NULL, "attentiveness" smallint NOT NULL DEFAULT '5', "behavior" smallint NOT NULL DEFAULT '5', "comprehension" smallint NOT NULL DEFAULT '5', "profile" "public"."students_profile_enum" NOT NULL DEFAULT 'Typical', "classroom_id" integer, CONSTRAINT "CHK_451816abc06c6ed51cd6209111" CHECK ("comprehension" BETWEEN 0 AND 10), CONSTRAINT "CHK_9c4837f6f33861b9a55548ebcf" CHECK ("behavior" BETWEEN 0 AND 10), CONSTRAINT "CHK_c4d4eb359f24e5626723823b5c" CHECK ("attentiveness" BETWEEN 0 AND 10), CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "classrooms" ("id" SERIAL NOT NULL, "name" character varying(120) NOT NULL, CONSTRAINT "PK_20b7b82896c06eda27548bd0c24" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "students" ADD CONSTRAINT "FK_b6f55adbe6f4e4d994549117071" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "students" DROP CONSTRAINT "FK_b6f55adbe6f4e4d994549117071"`);
        await queryRunner.query(`DROP TABLE "classrooms"`);
        await queryRunner.query(`DROP TABLE "students"`);
        await queryRunner.query(`DROP TYPE "public"."students_profile_enum"`);
    }

}
